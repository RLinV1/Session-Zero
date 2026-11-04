// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TokenArtCropper, isCroppable } from "../src/ui/TokenArtCropper";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
});
afterEach(cleanup);

// FR-GM-08: token art is framed before the unchanged upload path runs.
describe("TokenArtCropper (FR-GM-08)", () => {
  it("confirm hands a square File with the original base name to onConfirm", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 800, height: 400, close() {} }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({ drawImage })) as unknown as HTMLCanvasElement["getContext"]);
    let dims = [0, 0];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb, type) {
      dims = [this.width, this.height];
      cb(new Blob(["x"], { type }));
    });
    const onConfirm = vi.fn();
    render(<TokenArtCropper file={new File(["a"], "goblin.png", { type: "image/png" })} onCancel={() => {}} onConfirm={onConfirm} />);
    const use = screen.getByRole("button", { name: "Use art" });
    await waitFor(() => expect((use as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(use);
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const out = onConfirm.mock.calls[0]![0] as File;
    expect(out.name).toBe("goblin.png");
    expect(out.type).toBe("image/png");
    expect(dims).toEqual([512, 512]);
    // Initial framing: the centred 400x400 square of an 800x400 image.
    expect(drawImage.mock.calls[0]!.slice(1, 5)).toEqual([200, 0, 400, 400]);
  });

  it("shows an error and keeps Use art disabled for an unreadable image", async () => {
    vi.stubGlobal("createImageBitmap", async () => { throw new Error("bad"); });
    render(<TokenArtCropper file={new File(["a"], "x.png", { type: "image/png" })} onCancel={() => {}} onConfirm={() => {}} />);
    expect((await screen.findByRole("alert")).textContent).toBe("Could not read that image");
    expect((screen.getByRole("button", { name: "Use art" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("only crops the upload allowlist", () => {
    expect(isCroppable(new File([""], "a.webp", { type: "image/webp" }))).toBe(true);
    expect(isCroppable(new File([""], "a.gif", { type: "image/gif" }))).toBe(false);
  });
});
