import { t } from "../../lib/i18n";
// shadcn/ui Dialog composition; Radix owns focus trapping, Escape and focus restoration. MIT.
import * as React from "react";
import * as Primitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
const ReturnFocus =
  React.createContext<React.RefObject<HTMLElement | null> | null>(null);
export function Dialog(props: React.ComponentProps<typeof Primitive.Root>) {
  const target = React.useRef<HTMLElement | null>(null);
  const wasOpen = React.useRef(false);
  if (props.open && !wasOpen.current)
    target.current = document.activeElement as HTMLElement;
  wasOpen.current = !!props.open;
  return (
    <ReturnFocus.Provider value={target}>
      <Primitive.Root {...props} />
    </ReturnFocus.Provider>
  );
}
export const DialogTrigger = Primitive.Trigger;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentPropsWithoutRef<typeof Primitive.Content>) {
  const returnFocus = React.useContext(ReturnFocus);
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
      <Primitive.Content
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented && returnFocus?.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[28px] bg-card p-6 shadow-2xl outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close className="absolute right-4 top-4 rounded-full p-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <X size={18} />
          <span className="sr-only">{t("Close")}</span>
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
