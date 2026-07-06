import type { IdentityResult } from "@/lib/server/identity";
import type { Ticket } from "@/lib/tickets";

export type QuickSearchResult =
  | {
      kind: "tickets";
      query: string;
      tickets: Ticket[];
      external: null;
      message: string;
    }
  | {
      kind: "external";
      query: string;
      tickets: [];
      external: IdentityResult;
      message: string;
    }
  | {
      kind: "empty";
      query: string;
      tickets: [];
      external: IdentityResult | null;
      message: string;
    };
