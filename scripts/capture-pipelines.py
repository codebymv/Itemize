import json
import time
import jwt
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

def generate_valid_jwt():
    payload = {
        "id": "mock_user_123",
        "organization_id": 1,
        "exp": int((datetime.now() + timedelta(days=1)).timestamp())
    }
    return jwt.encode(payload, "dummy_secret", algorithm="HS256")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

        # Intercept both relative and absolute API calls
        def handle_api(route, request):
            url = request.url
            headers = {
                "Access-Control-Allow-Origin": "http://localhost:5173",
                "Access-Control-Allow-Credentials": "true"
            }
            if request.method == "OPTIONS":
                route.fulfill(
                    status=200,
                    headers={
                        **headers,
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-organization-id, x-workspace-id"
                    }
                )
                return

            if "/api/users/me" in url or "/api/auth/me" in url:
                route.fulfill(
                    status=200,
                    headers=headers,
                    json={
                        "success": True,
                        "data": {
                            "id": "mock_user_123",
                            "uid": "mock_user_123",
                            "email": "user@example.com",
                            "firstName": "Mock",
                            "lastName": "User",
                            "organizationId": 1,
                            "role": "admin"
                        }
                    }
                )
            elif "/api/organizations" in url:
                route.fulfill(
                    status=200,
                    headers=headers,
                    json={
                        "success": True,
                        "data": {
                            "id": 1,
                            "name": "Acme Corp"
                        }
                    }
                )
            elif "/api/onboarding/progress" in url:
                route.fulfill(
                    status=200,
                    headers=headers,
                    json={
                        "success": True,
                        "data": {
                            "seen": ["contacts", "pipelines", "dashboard"],
                            "dismissed": ["contacts", "pipelines", "dashboard"],
                            "completed": ["contacts", "pipelines", "dashboard"]
                        }
                    }
                )
            elif "/api/billing/subscription" in url:
                route.fulfill(
                    status=200,
                    headers=headers,
                    json={
                        "success": True,
                        "data": {
                            "id": "sub_123",
                            "planId": "pro",
                            "status": "active",
                            "currentPeriodEnd": "2030-01-01T00:00:00.000Z",
                            "cancelAtPeriodEnd": False,
                            "limits": {"contacts": 10000},
                            "usage": {"contacts": 4}
                        }
                    }
                )
            elif "/api/pipelines/deals/all" in url:
                # Deals fetch might happen here depending on page
                route.fulfill(
                    status=200,
                    headers=headers,
                    json={
                        "success": True,
                        "data": {
                            "deals": [],
                            "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
                        }
                    }
                )
            elif url.endswith("/api/pipelines"):
                route.fulfill(
                    status=200,
                    headers=headers,
                    json={
                        "success": True,
                        "data": [
                            {
                                "id": 1,
                                "name": "Main Sales Pipeline",
                                "is_default": True,
                                "organization_id": 1,
                                "stages": [
                                    {"id": "lead", "name": "Lead", "order": 0, "color": "#3b82f6"},
                                    {"id": "meeting", "name": "Meeting", "order": 1, "color": "#8b5cf6"},
                                    {"id": "proposal", "name": "Proposal", "order": 2, "color": "#f59e0b"},
                                    {"id": "contract", "name": "Contract", "order": 3, "color": "#10b981"}
                                ]
                            }
                        ]
                    }
                )
            elif "/api/pipelines/1" in url and not "deals" in url:
                route.fulfill(
                    status=200,
                    headers=headers,
                    json={
                        "success": True,
                        "data": {
                            "id": 1,
                            "name": "Main Sales Pipeline",
                            "is_default": True,
                            "organization_id": 1,
                            "stages": [
                                {"id": "lead", "name": "Lead", "order": 0, "color": "#3b82f6"},
                                {"id": "meeting", "name": "Meeting", "order": 1, "color": "#8b5cf6"},
                                {"id": "proposal", "name": "Proposal", "order": 2, "color": "#f59e0b"},
                                {"id": "contract", "name": "Contract", "order": 3, "color": "#10b981"}
                            ],
                            "deals": [
                                {
                                    "id": 101,
                                    "title": "Acme Corp Enterprise Deal",
                                    "value": 50000,
                                    "stage_id": "proposal",
                                    "probability": 70,
                                    "expected_close_date": "2024-06-30",
                                    "pipeline_id": 1,
                                    "contact": { "first_name": "John", "last_name": "Doe", "email": "john@acme.com" },
                                    "tags": ["Enterprise", "High Priority"]
                                },
                                {
                                    "id": 102,
                                    "title": "StartupIO Pro Plan",
                                    "value": 12000,
                                    "stage_id": "meeting",
                                    "probability": 40,
                                    "pipeline_id": 1,
                                    "contact": { "first_name": "Mike", "last_name": "Chen", "email": "mike@startup.io" }
                                },
                                {
                                    "id": 103,
                                    "title": "TechCorp Integration",
                                    "value": 25000,
                                    "stage_id": "contract",
                                    "probability": 90,
                                    "pipeline_id": 1,
                                    "contact": { "first_name": "Sarah", "last_name": "Johnson" }
                                },
                                {
                                    "id": 104,
                                    "title": "Global Retail Expansion",
                                    "value": 150000,
                                    "stage_id": "lead",
                                    "probability": 20,
                                    "pipeline_id": 1
                                }
                            ]
                        }
                    }
                )
            else:
                route.fulfill(status=200, headers=headers, json={"success": True, "data": []})

        page.route("**/api/**", handle_api)
        page.route("http://localhost:3001/api/**", handle_api)

        # WebSockets
        page.route("**/socket.io/*", lambda route: route.fulfill(
            status=200,
            body="0{\"sid\":\"dummy_sid\",\"upgrades\":[],\"pingInterval\":25000,\"pingTimeout\":20000}"
        ))

        # Navigate to base URL to establish origin
        page.goto("http://localhost:5173")

        valid_jwt = generate_valid_jwt()

        page.evaluate(f"""
            localStorage.setItem('itemize_auth_token', '{valid_jwt}');
            localStorage.setItem('itemize_token', '{valid_jwt}');
            localStorage.setItem('token', '{valid_jwt}');
            localStorage.setItem('itemize_logged_out', '0');
            localStorage.setItem('itemize_user', JSON.stringify({{"uid":"mock_user_123","id":"mock_user_123","name":"Mock User","email":"user@example.com","role":"admin"}}));
            localStorage.setItem('onboarding_completed', 'true');
            localStorage.setItem('has_seen_pipelines_tour', 'true');
            localStorage.setItem('hide_cookie_banner', 'true');
            localStorage.setItem('cookie-consent', 'true');
            localStorage.setItem('theme', 'light');
        """)

        page.add_init_script("""
            const style = document.createElement('style');
            style.innerHTML = `
                * { transition: none !important; animation: none !important; }
                .toast, [role="dialog"], #onboarding-modal, .cookie-banner, [role="alertdialog"], .fixed.bottom-0.z-50 {
                    display: none !important; opacity: 0 !important; pointer-events: none !important;
                }
                div[data-state="open"] { background-color: transparent !important; }
                body { pointer-events: auto !important; }
                [data-radix-focus-guard] { display: none !important; }
            `;
            document.head.appendChild(style);
        """)

        # Reload to ensure React context picks up the injected state
        page.reload()
        page.wait_for_load_state("networkidle")

        print("Navigating to /pipelines...")
        page.goto("http://localhost:5173/pipelines")

        page.wait_for_load_state("networkidle")
        time.sleep(3)

        page.wait_for_selector("text='Acme Corp Enterprise Deal'", timeout=10000)

        # Scrub DOM
        page.evaluate("""
            document.querySelectorAll('.toast, [role="dialog"], #onboarding-modal, .cookie-banner, [role="alertdialog"], [data-radix-focus-guard], .fixed.bottom-0.z-50').forEach(el => el.remove());
            document.querySelectorAll('div[data-state="open"][class*="fixed inset-0"]').forEach(el => el.remove());
            document.body.style.pointerEvents = "auto";
            document.querySelectorAll('.animate-spin').forEach(el => el.remove());
        """)

        print("Taking screenshot...")
        page.screenshot(path="frontend/public/screenshots/pipelines.png")
        print("Done!")

        browser.close()

if __name__ == "__main__":
    main()
