import { createContext, useContext } from "react";

/**
 * When a Radix modal `Dialog` is open, nodes portaled to `document.body` are typically
 * outside the dialog's focus subtree and receive the `inert` attribute, so clicks do
 * not reach them. Components that must float above dialog content (e.g. slash menus)
 * should portal into this element instead — set on `DialogContent`.
 */
export const ModalPortalRootContext = createContext<HTMLElement | null>(null);

export function useModalPortalRoot(): HTMLElement | null {
  return useContext(ModalPortalRootContext);
}
