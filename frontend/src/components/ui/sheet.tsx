"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetTitle = Dialog.Title;
export const SheetDescription = Dialog.Description;
export const SheetClose = Dialog.Close;

export function SheetContent({
  children,
  className,
  closeDisabled = false,
  ...props
}: React.ComponentProps<typeof Dialog.Content> & { closeDisabled?: boolean }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="sheet-overlay" />
      <Dialog.Content className={cn("sheet-content", className)} {...props}>
        {children}
        <Dialog.Close
          className="sheet-close"
          disabled={closeDisabled}
          aria-label="Close shopping bag"
        >
          <X size={21} />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
