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
                    "seen": ["contacts", "all", "dashboard", "workspaces", "canvas"],
                    "dismissed": ["contacts", "all", "dashboard", "workspaces", "canvas"],
                    "completed": ["contacts", "all", "dashboard", "workspaces", "canvas"]
                }
            }
        ))

        # Mock Contacts
        mock_contacts = [
            { "id": "c1", "name": "Sarah Johnson", "email": "sarah@company.co", "phone": "(555) 123-4567", "company": "TechCorp", "status": "active", "tags": [{"id": "t1", "name": "Customer", "color": "blue"}], "activities": [] },
            { "id": "c2", "name": "Mike Chen", "email": "mike@startup.io", "phone": "(555) 987-6543", "company": "StartupIO", "status": "active", "tags": [{"id": "t2", "name": "Lead", "color": "green"}], "activities": [] },
            { "id": "c3", "name": "Emma Wilson", "email": "emma@agency.com", "phone": "(555) 246-8101", "company": "Creative Agency", "status": "inactive", "tags": [{"id": "t3", "name": "Vendor", "color": "purple"}], "activities": [] },
            { "id": "c4", "name": "James Brown", "email": "james@corp.net", "phone": "(555) 135-7924", "company": "CorpNet", "status": "active", "tags": [{"id": "t1", "name": "Customer", "color": "blue"}], "activities": [] },
            { "id": "c5", "name": "Olivia Davis", "email": "olivia@studio.design", "phone": "(555) 369-2580", "company": "Studio Design", "status": "active", "tags": [{"id": "t2", "name": "Lead", "color": "green"}], "activities": [] },
            { "id": "c6", "name": "William Miller", "email": "will@logistics.com", "phone": "(555) 741-8529", "company": "Logistics Co", "status": "inactive", "tags": [], "activities": [] },
            { "id": "c7", "name": "Sophia Moore", "email": "sophia@retail.net", "phone": "(555) 852-9630", "company": "Retail Net", "status": "active", "tags": [{"id": "t1", "name": "Customer", "color": "blue"}], "activities": [] },
        ]

        page.route("**/api/contacts**", lambda route: route.fulfill(
            status=200,
            json={
                "success": True,
                "data": mock_contacts,
                "pagination": { "total": len(mock_contacts), "page": 1, "limit": 10, "totalPages": 1 }
            }
        ))

        page.route("**/api/tags*", lambda route: route.fulfill(
            status=200,
            json={
                "success": True,
                "data": []
            }
        ))

        page.route("**/api/segments*", lambda route: route.fulfill(
            status=200,
            json={
                "success": True,
                "data": []
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
            localStorage.setItem('has_seen_contacts_tour', 'true');
            localStorage.setItem('hide_cookie_banner', 'true');
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
                .toast, [role="dialog"], #onboarding-modal, .cookie-banner {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
        """)

        # 4. Capture

        # Reload to ensure React context picks up the injected state
        page.reload()
        page.wait_for_load_state("networkidle")

        print("Navigating to /contacts...")
        page.goto("http://localhost:5173/contacts")

        # Wait for network idle to ensure data is loaded
        page.wait_for_load_state("networkidle")
        time.sleep(3) # Extra wait for any React renders

        # Extra wait for the spinner to disappear
        page.wait_for_selector(".lucide-loader-2", state="hidden", timeout=5000)

        # Scrub DOM
        page.evaluate("""
            document.querySelectorAll('.toast, [role="dialog"], #onboarding-modal, .cookie-banner').forEach(el => el.remove());

            // hide any remaining loaders just in case
            document.querySelectorAll('.animate-spin').forEach(el => el.remove());
        """)

        print("Taking screenshot...")
        page.screenshot(path="frontend/public/screenshots/contacts.png")
        print("Done!")

        browser.close()

if __name__ == "__main__":
    main()
