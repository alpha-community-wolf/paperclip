import { describe, expect, it } from "vitest";
import { calculateSlashPickerPosition } from "./SlashCommandPicker";

describe("calculateSlashPickerPosition", () => {
  it("keeps the picker below the trigger when there is enough room", () => {
    const result = calculateSlashPickerPosition({
      anchorTop: 120,
      anchorLeft: 180,
      menuHeight: 160,
      menuWidth: 260,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(result).toEqual({ top: 124, left: 180 });
  });

  it("flips the picker above when it would overflow below", () => {
    const result = calculateSlashPickerPosition({
      anchorTop: 700,
      anchorLeft: 180,
      menuHeight: 160,
      menuWidth: 260,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(result).toEqual({ top: 536, left: 180 });
  });

  it("clamps the picker horizontally inside the viewport", () => {
    const result = calculateSlashPickerPosition({
      anchorTop: 120,
      anchorLeft: 980,
      menuHeight: 160,
      menuWidth: 260,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(result).toEqual({ top: 124, left: 756 });
  });
});
