import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = await context.new_page()

        print("Navigating to login page...")
        await page.goto("http://localhost:5173/login")

        print("Filling login form...")
        await page.fill("input[type='email']", "mevmusicofficial@gmail.com")
        await page.fill("input[type='password']", "password123")

        print("Submitting login form...")
        await page.click("button[type='submit']")

        print("Waiting for network idle...")
        await page.wait_for_load_state("networkidle")

        print("Looking for tour overlay...")
        try:
            # Try to click 'Skip Tour' if it appears
            skip_button = await page.wait_for_selector("text=Skip Tour", state="visible", timeout=5000)
            if skip_button:
                print("Clicking 'Skip Tour'...")
                await skip_button.click()
                await page.wait_for_timeout(1000) # wait for animation
        except Exception as e:
            print("No 'Skip Tour' button found or timed out:", e)

        try:
            # Try to close any other dialog by pressing Escape
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)
        except Exception:
            pass

        try:
            # Try to close the cookies banner if it exists
            accept_button = await page.wait_for_selector("text=Accept", state="visible", timeout=2000)
            if accept_button:
                print("Clicking 'Accept' cookies...")
                await accept_button.click()
                await page.wait_for_timeout(500)
        except Exception:
            pass

        print("Taking screenshot...")
        await page.screenshot(path="frontend/public/screenshots/dashboard.png")
        print("Screenshot saved to frontend/public/screenshots/dashboard.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
