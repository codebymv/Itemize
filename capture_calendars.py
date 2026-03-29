import asyncio
from playwright.async_api import async_playwright
import jwt
import time

def generate_valid_jwt():
    secret = "dummy_secret_for_testing"
    payload = {
        "id": 1,
        "email": "test@example.com",
        "organization_id": 1,
        "exp": int(time.time()) + 3600  # 1 hour from now
    }
    return jwt.encode(payload, secret, algorithm="HS256")

async def mock_calendar_routes(page):
    # Mock /api/users/me
    await page.route("**/api/users/me*", lambda route: route.fulfill(
        status=200,
        json={"user": {"id": 1, "name": "Test User", "email": "test@example.com", "organization_id": 1}}
    ))

    # Mock /api/organizations/*
    await page.route("**/api/organizations/*", lambda route: route.fulfill(
        status=200,
        json={"organization": {"id": 1, "name": "Test Org"}}
    ))

    # Mock /api/onboarding/progress
    await page.route("**/api/onboarding/progress*", lambda route: route.fulfill(
        status=200,
        json={"seen": ["canvas", "all", "dashboard", "workspaces", "calendars"], "dismissed": ["canvas", "all", "dashboard", "workspaces", "calendars"], "completed": ["canvas", "all", "dashboard", "workspaces", "calendars"]}
    ))

    # Mock /api/calendars
    await page.route("**/api/calendars*", lambda route: route.fulfill(
        status=200,
        json={
            "success": True,
            "data": {
                "calendars": [
                    {
                        "id": 1,
                        "organization_id": 1,
                        "name": "Initial Consultation",
                        "description": "30-minute discovery call for new clients.",
                        "slug": "initial-consult",
                        "timezone": "America/New_York",
                        "duration_minutes": 30,
                        "buffer_before_minutes": 10,
                        "buffer_after_minutes": 10,
                        "min_notice_hours": 24,
                        "max_future_days": 30,
                        "assignment_mode": "specific",
                        "confirmation_email": True,
                        "reminder_email": True,
                        "reminder_hours": 24,
                        "color": "#F59E0B",
                        "is_active": True,
                        "upcoming_bookings": 4
                    },
                    {
                        "id": 2,
                        "organization_id": 1,
                        "name": "Project Review",
                        "description": "Weekly status update and project review.",
                        "slug": "project-review",
                        "timezone": "America/New_York",
                        "duration_minutes": 60,
                        "buffer_before_minutes": 15,
                        "buffer_after_minutes": 15,
                        "min_notice_hours": 12,
                        "max_future_days": 60,
                        "assignment_mode": "specific",
                        "confirmation_email": True,
                        "reminder_email": True,
                        "reminder_hours": 2,
                        "color": "#3B82F6",
                        "is_active": True,
                        "upcoming_bookings": 12
                    },
                    {
                        "id": 3,
                        "organization_id": 1,
                        "name": "Support Call",
                        "description": "Technical support for existing clients.",
                        "slug": "support-call",
                        "timezone": "America/New_York",
                        "duration_minutes": 15,
                        "buffer_before_minutes": 5,
                        "buffer_after_minutes": 5,
                        "min_notice_hours": 1,
                        "max_future_days": 14,
                        "assignment_mode": "round_robin",
                        "confirmation_email": True,
                        "reminder_email": False,
                        "reminder_hours": 0,
                        "color": "#10B981",
                        "is_active": True,
                        "upcoming_bookings": 8
                    }
                ]
            }
        }
    ))

    # Intercept WebSocket
    await page.route("**/socket.io/?*", lambda route: route.fulfill(status=200, body="ok"))

    # Catch-all for API to prevent hanging
    await page.route("**/api/**", lambda route: route.fulfill(status=200, json={"success": True, "data": {}}))

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800},
            device_scale_factor=2
        )
        page = await context.new_page()

        # 1. Setup Routes and Mocks
        await mock_calendar_routes(page)

        # 2. Establish Origin and Inject State
        await page.goto("http://localhost:5174", wait_until="networkidle")

        valid_jwt = generate_valid_jwt()

        await page.evaluate(f"""
            localStorage.setItem('itemize_auth_token', '{valid_jwt}');
            localStorage.setItem('itemize_token', '{valid_jwt}');
            localStorage.setItem('token', '{valid_jwt}');
            localStorage.setItem('itemize_logged_out', '0');
            localStorage.setItem('onboarding_completed', 'true');
            localStorage.setItem('has_seen_canvas_tour', 'true');
            localStorage.setItem('hide_cookie_banner', 'true');
            localStorage.setItem('itemize-theme', 'light');
        """)

        # 3. Defensive DOM Manipulation
        await page.add_init_script("""
            const style = document.createElement('style');
            style.innerHTML = `
                /* Hide toasts */
                [role="region"][aria-label="Notifications (F8)"] { display: none !important; }
                .Toastify { display: none !important; }
                /* Hide modals */
                [role="dialog"] { display: none !important; }
                /* Hide banners */
                #cookie-consent, .cookie-banner { display: none !important; }
            `;
            document.head.appendChild(style);
        """)

        # 4. Navigate to Calendars and Capture
        await page.goto("http://localhost:5174/calendars", wait_until="networkidle")

        # Wait a bit for React to render and animations to settle
        await page.wait_for_timeout(2000)

        # Take the screenshot
        await page.screenshot(path="frontend/public/screenshots/calendars.png")

        print("Screenshot saved to frontend/public/screenshots/calendars.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())