import json
import time
import jwt
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

def generate_valid_jwt():
    # The frontend expects a JWT with specific claims
    payload = {
        "id": "mock_user_123",
        "organization_id": "mock_org_456",
        "exp": int((datetime.now() + timedelta(days=1)).timestamp())
    }
    # Sign with a dummy secret - the frontend only decodes it to check 'exp', doesn't verify signature
    return jwt.encode(payload, "dummy_secret", algorithm="HS256")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create context with a generic desktop viewport size
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Enable console logs
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

        # 1. Network Interception & Data Mocking

        # Route generic requests first so specific routes override them
        page.route("**/api/**", lambda route: route.fulfill(
            status=200,
            json={"success": True, "data": []}
        ))

        # Mock /api/users/me and /api/auth/me
        def handle_user_me(route):
            route.fulfill(
                status=200,
                json={
                    "success": True,
                    "data": {
                        "id": "mock_user_123",
                        "email": "user@example.com",
                        "firstName": "Mock",
                        "lastName": "User",
                        "organizationId": "mock_org_456",
                        "role": "admin"
                    }
                }
            )

        page.route("**/api/users/me", handle_user_me)
        page.route("**/api/auth/me", handle_user_me)

        # Mock /api/organizations/*
        page.route("**/api/organizations/*", lambda route: route.fulfill(
            status=200,
            json={
                "success": True,
                "data": {
                    "id": "mock_org_456",
                    "name": "Acme Corp"
                }
            }
        ))

        # Mock /api/onboarding/progress
        page.route("**/api/onboarding/progress", lambda route: route.fulfill(
            status=200,
            json={
                "success": True,
                "data": {
                    "seen": ["automations", "contacts", "all", "dashboard", "workspaces", "canvas"],
                    "dismissed": ["automations", "contacts", "all", "dashboard", "workspaces", "canvas"],
                    "completed": ["automations", "contacts", "all", "dashboard", "workspaces", "canvas"]
                }
            }
        ))

        # Mock email templates
        page.route("**/api/automations/email-templates**", lambda route: route.fulfill(
            status=200,
            json={
                "success": True,
                "data": {
                    "templates": [
                        {"id": 1, "name": "Welcome Email", "subject": "Welcome!", "body": "Hello"}
                    ]
                }
            }
        ))

        # Mock workflow
        workflow_data = {
            "id": 1,
            "name": "New Lead Follow-up",
            "description": "Automatically send welcome email and assign tasks for new leads",
            "trigger_type": "contact_added",
            "trigger_config": {},
            "is_active": True,
            "steps": [
                {
                    "id": 101,
                    "workflow_id": 1,
                    "step_order": 1,
                    "step_type": "send_email",
                    "step_config": {
                        "template_id": 1,
                        "template_name": "Welcome Email"
                    }
                },
                {
                    "id": 102,
                    "workflow_id": 1,
                    "step_order": 2,
                    "step_type": "wait",
                    "step_config": {
                        "delay_days": 2,
                        "delay_hours": 0,
                        "delay_minutes": 0
                    }
                },
                {
                    "id": 103,
                    "workflow_id": 1,
                    "step_order": 3,
                    "step_type": "create_task",
                    "step_config": {
                        "title": "Follow up call",
                        "description": "Call the new lead to check in.",
                        "due_days": 1
                    }
                },
                {
                    "id": 104,
                    "workflow_id": 1,
                    "step_order": 4,
                    "step_type": "add_tag",
                    "step_config": {
                        "tag_name": "Engaged Lead"
                    }
                },
                {
                    "id": 105,
                    "workflow_id": 1,
                    "step_order": 5,
                    "step_type": "condition",
                    "step_config": {
                        "condition": "Tag exists"
                    }
                },
                {
                    "id": 106,
                    "workflow_id": 1,
                    "step_order": 6,
                    "step_type": "webhook",
                    "step_config": {
                        "url": "https://api.example.com/sync",
                        "method": "POST"
                    }
                }
            ]
        }

        page.route("**/api/automations/workflows/1**", lambda route: route.fulfill(
            status=200,
            json={
                "success": True,
                "data": workflow_data
            }
        ))

        page.route("**/api/notifications*", lambda route: route.fulfill(
            status=200,
            json={
                "success": True,
                "data": [],
                "pagination": {"total": 0, "page": 1, "limit": 20, "totalPages": 0}
            }
        ))

        # WebSockets
        page.route("**/socket.io/*", lambda route: route.fulfill(
            status=200,
            body="0{\"sid\":\"dummy_sid\",\"upgrades\":[],\"pingInterval\":25000,\"pingTimeout\":20000}"
        ))

        # Subscriptions
        page.route("**/api/billing/subscription", lambda route: route.fulfill(
            status=200,
            json={
                "success": True,
                "data": {
                    "id": "sub_123",
                    "planId": "pro",
                    "status": "active",
                    "currentPeriodEnd": "2030-01-01T00:00:00.000Z",
                    "cancelAtPeriodEnd": False,
                    "limits": {
                        "contacts": 10000,
                        "workspaces": 100
                    },
                    "usage": {
                        "contacts": 4,
                        "workspaces": 2
                    }
                }
            }
        ))

        # 2. State Injection

        # Navigate to base URL to establish origin
        page.goto("http://localhost:5173")

        valid_jwt = generate_valid_jwt()

        page.evaluate(f"""
            localStorage.setItem('itemize_auth_token', '{valid_jwt}');
            localStorage.setItem('itemize_token', '{valid_jwt}');
            localStorage.setItem('token', '{valid_jwt}');
            localStorage.setItem('itemize_logged_out', '0');
            localStorage.setItem('itemize_user', JSON.stringify({{"uid":"mock_user_123","name":"Mock User","email":"user@example.com","role":"admin"}}));
            localStorage.setItem('onboarding_completed', 'true');
            localStorage.setItem('has_seen_automations_tour', 'true');
            localStorage.setItem('hide_cookie_banner', 'true');
            localStorage.setItem('cookie-consent', 'true');
            localStorage.setItem('theme', 'light');
        """)

        # 3. Defensive DOM Manipulation

        page.add_init_script("""
            const style = document.createElement('style');
            style.innerHTML = `
                * {
                    transition: none !important;
                    animation: none !important;
                }
                .toast, [role="dialog"], #onboarding-modal, .cookie-banner, [role="alertdialog"], .fixed.bottom-0.z-50 {
                    display: none !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                }
                div[data-state="open"] {
                    background-color: transparent !important;
                }
                body {
                    pointer-events: auto !important;
                }
                [data-radix-focus-guard] {
                    display: none !important;
                }
                /* Hide react flow attribution */
                .react-flow__attribution {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
        """)

        # 4. Capture

        # Reload to ensure React context picks up the injected state
        page.reload()
        page.wait_for_load_state("networkidle")

        print("Navigating to /automations/1...")
        page.goto("http://localhost:5173/automations/1")

        # Wait for network idle to ensure data is loaded
        page.wait_for_load_state("networkidle")
        time.sleep(3) # Extra wait for any React renders

        # Extra wait for the spinner to disappear
        page.wait_for_selector(".lucide-loader-2", state="hidden", timeout=5000)

        # Make sure layout is fully loaded.
        page.wait_for_selector(".react-flow__node", state="visible", timeout=5000)

        # Zoom out significantly and pan
        # Center view by fit view button
        try:
            page.click('.react-flow__controls-fitview', timeout=2000)
            time.sleep(1)
            # Try to zoom out
            page.click('.react-flow__controls-zoomout', timeout=2000)
            time.sleep(0.5)
            page.click('.react-flow__controls-zoomout', timeout=2000)
            time.sleep(0.5)
            page.click('.react-flow__controls-zoomout', timeout=2000)
        except:
            pass

        # Try to drag the canvas up to show more nodes below
        page.mouse.move(600, 400)
        page.mouse.down()
        page.mouse.move(600, -200) # drag up to pan down
        page.mouse.up()

        time.sleep(1)

        # Handle the cookie banner if it's there
        try:
            # Look for a button containing "Accept" and click it
            page.click("text='Accept'", timeout=2000)
        except Exception:
            pass

        # Scrub DOM
        page.evaluate("""
            document.querySelectorAll('.toast, [role="dialog"], #onboarding-modal, .cookie-banner, [role="alertdialog"], [data-radix-focus-guard], .fixed.bottom-0.z-50').forEach(el => el.remove());

            // remove any radix dialog backdrops which have a specific class or attributes
            document.querySelectorAll('div[data-state="open"][class*="fixed inset-0"]').forEach(el => el.remove());

            // reset body pointer events
            document.body.style.pointerEvents = "auto";

            // hide any remaining loaders just in case
            document.querySelectorAll('.animate-spin').forEach(el => el.remove());
        """)

        print("Taking screenshot...")
        page.screenshot(path="../frontend/public/screenshots/automations.png")
        print("Done!")

        browser.close()

if __name__ == "__main__":
    main()
