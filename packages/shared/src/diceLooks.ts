import { z } from "zod";
import { sharedMsg, validationMessage } from "./i18n";

/**
 * Dice looks saved to an account (ADR 0017 O3). A look is a named set of pictures, at most one
 * per die type, drawn by the browser's `Die3D`. Until `shared-dice-looks`, a look is only ever
 * drawn on its owner's own screen, so nothing here enters room state.
 */

export const DIE_NAMES = ["d4", "d6", "d8", "d10", "d12", "d20"] as const;
export const DieName = z.enum(DIE_NAMES);
export type DieName = z.infer<typeof DieName>;

export const DiceLookName = z
  .string()
  .trim()
  .min(1, { message: validationMessage(sharedMsg("valid.nameBlank")) })
  .max(40, { message: validationMessage(sharedMsg("valid.nameTooLong", { max: 40 })) });

/** Most looks one account may hold. */
export const MAX_DICE_LOOKS = 50;
/** Largest picture file accepted for a die, as the browser accepts. */
export const MAX_DICE_PICTURE_BYTES = 5 * 1024 * 1024;

/** The painted template sheet (3:2) and the largest single square picture. */
export const DICE_SHEET = { width: 1536, height: 1024 } as const;
export const DICE_SQUARE_MAX = 512;

/**
 * Which kind of picture this is from its proportions, as the browser decides it: a 3:2 painted
 * template no larger than the sheet, or a square of at most 512 px; null for anything else.
 * Within 2% of the ratio, matching the browser's tolerance for rounded sizes.
 */
export function diceFaceLayout(width: number, height: number): "sheet" | "single" | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  const near = (ratio: number) => Math.abs(width / height / ratio - 1) <= 0.02;
  if (near(DICE_SHEET.width / DICE_SHEET.height)) {
    return width <= DICE_SHEET.width && height <= DICE_SHEET.height ? "sheet" : null;
  }
  if (near(1)) return width <= DICE_SQUARE_MAX && height <= DICE_SQUARE_MAX ? "single" : null;
  return null;
}

/** Text fields sent alongside a die's picture in a multipart upload. */
export const DiceLookFaceFields = z
  .object({ width: z.coerce.number().int().positive(), height: z.coerce.number().int().positive() })
  .refine((f) => diceFaceLayout(f.width, f.height) !== null, {
    message: validationMessage(sharedMsg("valid.diceLookPicture", { width: DICE_SHEET.width, height: DICE_SHEET.height, max: DICE_SQUARE_MAX })),
  });
export type DiceLookFaceFields = z.infer<typeof DiceLookFaceFields>;

export const CreateDiceLookRequest = z.object({ name: DiceLookName });
export type CreateDiceLookRequest = z.infer<typeof CreateDiceLookRequest>;

export const RenameDiceLookRequest = z.object({ name: DiceLookName });
export type RenameDiceLookRequest = z.infer<typeof RenameDiceLookRequest>;

export const ActiveDiceLookRequest = z.object({ id: z.uuid().nullable() });
export type ActiveDiceLookRequest = z.infer<typeof ActiveDiceLookRequest>;

export interface DiceFaceView {
  /** Origin-relative picture URL. */
  url: string;
  width: number;
  height: number;
}

export interface DiceLookView {
  id: string;
  name: string;
  faces: Partial<Record<DieName, DiceFaceView>>;
  /** ISO-8601 time of the last change, so a browser can tell a look was edited elsewhere. */
  updatedAt: string;
}

/** `GET /api/library/dice`: the account's looks and the one in use. */
export interface DiceLooksResponse {
  looks: DiceLookView[];
  activeId: string | null;
}
