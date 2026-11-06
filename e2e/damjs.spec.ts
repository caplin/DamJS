import { test, expect } from "@playwright/test";
import { captureDamJSLogs, injectDamJS, loginToPro, openSpotTicket } from "./helpers";

test.describe("DamJS injected into FX Pro", () => {
  test.beforeEach(async ({ page }) => {
    await loginToPro(page);
  });

  test("injects without breaking the app and shows the preset matchers", async ({ page }) => {
    const logs = captureDamJSLogs(page);
    const damJS = await injectDamJS(page);
    for (const subject of ["/", "/PRIVATE/TRADE/FX", "/FX/EURUSD"]) {
      await expect(damJS.matcher(subject)).toBeVisible();
    }
    // StreamLink should still be delivering prices to the tiles after interception.
    await expect(page.locator("[data-testid='fx-tile']:visible").first()).toBeVisible();
    expect(logs.pageErrors).toEqual([]);
  });

  test("logs incoming messages for the / matcher", async ({ page }) => {
    const logs = captureDamJSLogs(page);
    const damJS = await injectDamJS(page);

    await damJS.selectMatcher("/");
    await damJS.enableLogging("Incoming");

    // Tiles are streaming prices, so record updates should arrive on their own.
    await expect.poll(() => logs.incoming().length, { timeout: 15_000 }).toBeGreaterThan(0);
    const priceUpdate = logs.incoming().find((m) => m.subject.startsWith("/FX/"));
    expect(priceUpdate, "expected a /FX/ price update to be logged").toBeTruthy();
    expect(Object.keys(priceUpdate!.fields).length).toBeGreaterThan(0);
    // Logging only — nothing outgoing should be logged.
    expect(logs.outgoing()).toEqual([]);
    expect(logs.pageErrors).toEqual([]);
  });

  test("logs outgoing trade messages for /PRIVATE/TRADE/FX when doing a spot trade", async ({ page }) => {
    const logs = captureDamJSLogs(page);
    const damJS = await injectDamJS(page);

    await damJS.selectMatcher("/PRIVATE/TRADE/FX");
    await damJS.enableLogging("Outgoing");

    // With ESP off, clicking a tile price opens an RFS spot ticket and requests a quote.
    const { ticket, currencyPair } = await openSpotTicket(page);
    await expect
      .poll(() => logs.outgoing().find((m) => m.fields.MsgType === "Submit"), { timeout: 15_000 })
      .toMatchObject({
        subject: "/PRIVATE/TRADE/FX",
        fields: { CurrencyPair: currencyPair, TradingType: "SPOT", L1_Tenor: "SPOT" },
      });

    // Execute against the streamed quote.
    await ticket.getByTestId("ask-button").click();
    await expect
      .poll(() => logs.outgoing().map((m) => m.fields.MsgType), { timeout: 15_000 })
      .toContain("Execute");

    // Every logged outgoing message must be for the selected subject only.
    for (const m of logs.outgoing()) expect(m.subject).toBe("/PRIVATE/TRADE/FX");
    expect(logs.incoming()).toEqual([]);
    expect(logs.pageErrors).toEqual([]);
    expect(logs.consoleErrors.filter((e) => /Maximum call stack/.test(e))).toEqual([]);
  });
});
