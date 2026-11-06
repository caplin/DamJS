import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { damJSDomain } from "../playwright.config";

export const DEFAULT_USER = process.env.FXTRADER_USER || "user1@caplin.com";

/** Logs in to FX Pro (MFA code of all 1s, as in the mono pw-tests) and waits for tiles. */
export async function loginToPro(page: Page, username = DEFAULT_USER) {
  await page.goto("/");
  await page.locator("#login_user_input").fill(username);
  await page.locator("#login_pass_input").fill("");
  await page.locator("[type='submit']").click();
  const mfaInputs = page.locator(".login-code-input-element");
  await mfaInputs.nth(1).waitFor();
  for (const input of await mfaInputs.all()) {
    await input.type("1");
  }
  await page.locator("[type='submit']").click();
  // Newer Pro versions may show an "out of date browser" warning for Playwright's Chromium.
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await expect(async () => {
    if (await continueButton.isVisible()) await continueButton.click();
    await expect(page.locator(".login-panel")).toBeHidden({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  // A saved non-default locale can show a "reload" prompt that blocks the app
  // (same handling as BaseSteps.waitForProToLoad in the mono pw-tests).
  const reloadModal = page.locator(".locale-reload-modal");
  for (let attempt = 0; attempt < 3; attempt++) {
    const shown = await reloadModal.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
    if (!shown) break;
    await Promise.all([page.waitForEvent("load"), reloadModal.locator("button").click({ noWaitAfter: true })]);
  }
  // The saved workspace may open on another tab (e.g. MM); make sure the FX one is active.
  const fxTab = page.locator(".app-header-tab").filter({ hasText: /^FX$/ });
  await fxTab.waitFor({ timeout: 30_000 });
  await fxTab.click();
  await page.locator("[data-testid='fx-tile']:visible").first().waitFor({ timeout: 30_000 });
}

/** Runs the same code as the bookmarklet in index.html, pointed at the local server. */
export async function injectDamJS(page: Page) {
  await page.evaluate((domain) => {
    (window as any).damJSDomain = domain;
    const s = document.createElement("script");
    s.src = domain + "/index.js";
    document.getElementsByTagName("head")[0].appendChild(s);
  }, damJSDomain);
  const damJS = new DamJSPanel(page);
  await expect(damJS.addSubjectButton()).toBeVisible({ timeout: 15_000 });
  return damJS;
}

export type LoggedMessage = {
  direction: "Incoming" | "Outgoing" | "Forwarding";
  subject: string;
  fields: Record<string, string>;
};

/**
 * Collects DamJS's console.log("Incoming:"/"Outgoing:"/"Forwarding :", subject, fields) calls.
 * Also records page errors so tests can assert DamJS didn't break the host app.
 */
export function captureDamJSLogs(page: Page) {
  const messages: LoggedMessage[] = [];
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e));
  page.on("console", async (msg) => {
    const text = msg.text();
    if (msg.type() === "error" || /Maximum call stack/.test(text)) consoleErrors.push(text);
    const direction = (["Incoming:", "Outgoing:", "Forwarding :"] as const).find((d) => text.startsWith(d));
    if (!direction) return;
    const args = await Promise.all(msg.args().map((a) => a.jsonValue().catch(() => undefined)));
    messages.push({ direction: direction.replace(/ ?:$/, "") as LoggedMessage["direction"], subject: args[1], fields: args[2] ?? {} });
  });
  return {
    messages,
    pageErrors,
    consoleErrors,
    incoming: () => messages.filter((m) => m.direction === "Incoming"),
    outgoing: () => messages.filter((m) => m.direction === "Outgoing"),
    forwarded: () => messages.filter((m) => m.direction === "Forwarding"),
    clear: () => (messages.length = 0),
  };
}

/** Page object for the injected DamJS React UI (no test ids, so text-based). */
export class DamJSPanel {
  readonly root: Locator;
  constructor(readonly page: Page) {
    this.root = page.locator("div.drag").filter({ has: page.getByRole("button", { name: "Permissions" }) });
  }
  addSubjectButton() {
    return this.root.getByRole("button", { name: "Add Subject" });
  }
  matcher(subject: string) {
    return this.root.getByText(subject, { exact: true });
  }
  async addMatcher(subject: string) {
    await this.root.locator("input").first().fill(subject);
    await this.addSubjectButton().click();
    await expect(this.matcher(subject)).toBeVisible();
  }
  async selectMatcher(subject: string) {
    await this.matcher(subject).click();
    await expect(this.root.getByRole("button", { name: "Back" })).toBeVisible();
  }
  async back() {
    await this.root.getByRole("button", { name: "Back" }).click();
  }
  /** Row of buttons for "Filter" / "Inject" / "Log" in the matcher config view. */
  row(label: "Filter" | "Inject" | "Log") {
    return this.root.locator("div").filter({ has: this.page.locator(`span:text-is("${label}")`) }).last();
  }
  toggleButton(label: "Filter" | "Inject" | "Log", direction: Direction) {
    return this.row(label).getByRole("button", { name: direction, exact: true });
  }
  /** Turns a Filter/Inject/Log flag on; MatcherButton turns lightgreen when on. */
  async enable(label: "Filter" | "Inject" | "Log", direction: Direction) {
    await this.toggleButton(label, direction).click();
    await expect(this.toggleButton(label, direction)).toHaveCSS("background-color", LIGHT_GREEN);
  }
  async disable(label: "Filter" | "Inject" | "Log", direction: Direction) {
    await this.toggleButton(label, direction).click();
    await expect(this.toggleButton(label, direction)).not.toHaveCSS("background-color", LIGHT_GREEN);
  }
  async enableLogging(direction: Direction) {
    await this.enable("Log", direction);
  }

  /**
   * Opens "Conf" and fills in injection key/value rows for one direction,
   * then returns to the matcher config view.
   */
  async configureInjection(direction: Direction, fields: Record<string, string>) {
    await this.row("Inject").getByRole("button", { name: "Conf" }).click();
    const section = this.root.locator(`div:has(> span:text-is("Inject ${direction} Elements"))`);
    await expect(section).toBeVisible();
    const entries = Object.entries(fields);
    for (let i = 0; i < entries.length; i++) {
      const rows = section.locator("> div");
      if ((await rows.count()) <= i) {
        await section.getByRole("button", { name: `Add ${direction} Row` }).click();
      }
      const inputs = rows.nth(i).locator("input");
      await inputs.nth(0).fill(entries[i][0]);
      await inputs.nth(1).fill(entries[i][1]);
      await expect(inputs.nth(0)).toHaveValue(entries[i][0]);
      await expect(inputs.nth(1)).toHaveValue(entries[i][1]);
    }
    await this.back();
    await expect(this.row("Inject")).toBeVisible();
  }

  /** Opens the "View" list of messages held by the filter. */
  async openCaptured() {
    await this.row("Filter").getByRole("button", { name: "View" }).click();
    await expect(this.root.getByRole("button", { name: "Back" })).toBeVisible();
  }
  /** Held messages in the "View" list; each has Forward / Remove / Info buttons. */
  capturedItems() {
    return this.root.locator("div:has(> button:text-is('Forward'))");
  }
}

type Direction = "Incoming" | "Outgoing";
const LIGHT_GREEN = "rgb(144, 238, 144)";

/**
 * `test` with a `sentFrames` fixture: the text of every RTTP WebSocket frame
 * the page sends. The listener is attached before login (when the StreamLink
 * socket is opened), so use the fixture in beforeEach as well as the test.
 */
export const test = base.extend<{ sentFrames: string[] }>({
  sentFrames: async ({ page }, use) => {
    const frames: string[] = [];
    page.on("websocket", (ws) => ws.on("framesent", (f) => frames.push(String(f.payload))));
    await use(frames);
  },
});

/**
 * Finds a visible two-way spot tile (single ask button, SP tenor) that isn't
 * underneath the DamJS panel, which sits over the left edge of the page.
 */
export async function findSpotTile(page: Page): Promise<{ tile: Locator; currencyPair: string }> {
  const panelBox = await new DamJSPanel(page).root.boundingBox();
  const tiles = page.locator("[data-testid='fx-tile']:visible");
  for (let i = 0; i < (await tiles.count()); i++) {
    const tile = tiles.nth(i);
    const box = await tile.boundingBox();
    if (panelBox && box && box.x < panelBox.x + panelBox.width && box.y < panelBox.y + panelBox.height) continue;
    if ((await tile.getByTestId("ask-execute-button").count()) !== 1) continue;
    if ((await tile.locator(".caplin-badge", { hasText: /^SP$/ }).count()) === 0) continue;
    const currencyPair = (await tile.innerText()).match(/\b[A-Z]{6}\b/)?.[0];
    if (currencyPair) return { tile, currencyPair };
  }
  throw new Error("No visible two-way spot tile found outside the DamJS panel");
}

/**
 * Opens an RFS spot ticket from a tile (ESP off). Newer Pro versions need
 * "Get Stream" to send the quote request; pass requestStream=false to skip it.
 */
export async function openSpotTicket(page: Page, { requestStream = true } = {}) {
  const { tile, currencyPair } = await findSpotTile(page);
  await tile.getByTestId("ask-execute-button").click({ position: { x: 50, y: 50 } });
  const ticket = page.locator(".rfsTicket");
  await expect(ticket).toBeVisible();
  const getStream = ticket.locator(".btn-new-trade");
  const needsGetStream = await getStream.waitFor({ timeout: 3000 }).then(() => true, () => false);
  if (needsGetStream && requestStream) await getStream.click();
  return { ticket, currencyPair, getStream: needsGetStream ? getStream : null };
}
