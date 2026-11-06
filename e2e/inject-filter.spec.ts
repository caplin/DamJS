import { expect } from "@playwright/test";
import { captureDamJSLogs, findSpotTile, injectDamJS, loginToPro, openSpotTicket, test } from "./helpers";

test.describe("DamJS injection and filtering", () => {
  // sentFrames is requested here so it's listening before login opens the RTTP socket.
  test.beforeEach(async ({ page, sentFrames: _ }) => {
    await loginToPro(page);
  });

  test("injects configured fields into incoming messages", async ({ page }) => {
    const logs = captureDamJSLogs(page);
    const damJS = await injectDamJS(page);
    const { tile, currencyPair } = await findSpotTile(page);
    const subject = `/FX/${currencyPair}`;

    await damJS.addMatcher(subject);
    await damJS.selectMatcher(subject);
    await damJS.configureInjection("Incoming", { DamJSTestField: "injected", L1_AllInAskRate: "9.87654" });
    await damJS.enable("Inject", "Incoming");
    await damJS.enableLogging("Incoming");

    // The logged (post-injection) fields include the injected values...
    await expect
      .poll(() => logs.incoming().find((m) => m.fields.DamJSTestField === "injected"), { timeout: 15_000 })
      .toMatchObject({ fields: { L1_AllInAskRate: "9.87654" } });
    for (const m of logs.incoming()) expect(m.subject).toContain(subject);
    // ...and the app receives them: the tile shows the injected ask rate.
    await expect(tile.getByTestId("ask-execute-button")).toContainText("9.87", { timeout: 15_000 });
    expect(logs.pageErrors).toEqual([]);
  });

  test("injects configured fields into outgoing messages", async ({ page, sentFrames }) => {
    const logs = captureDamJSLogs(page);
    const damJS = await injectDamJS(page);

    await damJS.selectMatcher("/PRIVATE/TRADE/FX");
    await damJS.configureInjection("Outgoing", { Remarks: "DamJSInjectedRemark" });
    await damJS.enable("Inject", "Outgoing");
    await damJS.enableLogging("Outgoing");

    await openSpotTicket(page);

    await expect
      .poll(() => logs.outgoing().find((m) => m.fields.MsgType === "Submit"), { timeout: 15_000 })
      .toMatchObject({ fields: { Remarks: "DamJSInjectedRemark" } });
    // The injected value is what actually goes over the wire.
    await expect
      .poll(() => sentFrames.filter((f) => f.includes("CONTRIB+/PRIVATE/TRADE/FX") && f.includes("Remarks%3DDamJSInjectedRemark")).length)
      .toBeGreaterThan(0);
    // An empty, unconfigured incoming row must not leak an empty field into outgoing messages.
    for (const m of logs.outgoing()) expect(Object.keys(m.fields)).not.toContain("");
    expect(logs.pageErrors).toEqual([]);
  });

  test("holds incoming messages while filtered and forwards them from View", async ({ page }) => {
    const logs = captureDamJSLogs(page);
    const damJS = await injectDamJS(page);
    const { tile, currencyPair } = await findSpotTile(page);
    const subject = `/FX/${currencyPair}`;
    const askButton = tile.getByTestId("ask-execute-button");

    await damJS.addMatcher(subject);
    await damJS.selectMatcher(subject);
    await damJS.enable("Filter", "Incoming");

    // While filtered, price updates are held and the tile stops ticking.
    await damJS.openCaptured();
    const held = damJS.capturedItems();
    await expect.poll(() => held.count(), { timeout: 15_000 }).toBeGreaterThan(1);
    await expect(held.first()).toContainText(subject);
    const frozenPrice = await askButton.innerText();
    const heldBefore = await held.count();
    await page.waitForTimeout(3000);
    expect(await askButton.innerText()).toBe(frozenPrice);
    expect(await held.count()).toBeGreaterThan(heldBefore);

    // Forwarding releases a held message to the app and removes it from the list.
    const firstHeldText = await held.first().innerText();
    await held.first().getByRole("button", { name: "Forward" }).click();
    await expect.poll(() => logs.forwarded().length).toBe(1);
    expect(logs.forwarded()[0].subject).toContain(subject);
    await expect(held.first()).not.toHaveText(firstHeldText);
    expect(logs.pageErrors).toEqual([]);

    // Turning the filter off lets prices flow again.
    await damJS.back();
    await damJS.disable("Filter", "Incoming");
    await expect(askButton).not.toHaveText(frozenPrice, { timeout: 15_000 });
  });

  test("holds outgoing messages while filtered and sends them when forwarded from View", async ({ page, sentFrames }) => {
    const logs = captureDamJSLogs(page);
    const damJS = await injectDamJS(page);
    const submitFrames = () => sentFrames.filter((f) => f.includes("CONTRIB+/PRIVATE/TRADE/FX") && f.includes("MsgType%3DSubmit"));

    await damJS.selectMatcher("/PRIVATE/TRADE/FX");
    await damJS.enable("Filter", "Outgoing");

    await openSpotTicket(page);

    // The quote request is held, not sent.
    await damJS.openCaptured();
    const heldSubmit = damJS.capturedItems().filter({ hasText: "/PRIVATE/TRADE/FX (CONTRIB)" });
    await expect(heldSubmit).toHaveCount(1, { timeout: 15_000 });
    await page.waitForTimeout(2000);
    expect(submitFrames()).toEqual([]);
    await heldSubmit.getByRole("button", { name: "Info" }).click();
    await expect(heldSubmit).toContainText("MsgType : Submit");

    // Forwarding sends it unchanged and removes it from the list.
    await heldSubmit.getByRole("button", { name: "Forward" }).click();
    await expect.poll(() => submitFrames().length, { timeout: 10_000 }).toBe(1);
    await expect(heldSubmit).toHaveCount(0);
    expect(logs.forwarded()).toEqual([
      expect.objectContaining({ subject: "/PRIVATE/TRADE/FX", fields: expect.objectContaining({ MsgType: "Submit" }) }),
    ]);
    expect(logs.pageErrors).toEqual([]);
  });
});
