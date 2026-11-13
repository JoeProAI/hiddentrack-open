// Hidden Track store links. These are public Stripe Payment Link URLs, not secrets.
// Leave a value null and its button stays hidden (the CD block shows "opening soon").
export const store = {
  // Counting House CD pre-order, $15 plus flat US shipping, hosted Stripe Checkout.
  cdPreorderUrl: "https://buy.stripe.com/9B68wP2I43Pk01V0HFebu0t" as string | null,
  // "Keep Hidden Track free": pay what you want, $1 minimum.
  tipUrl: "https://donate.stripe.com/dRm9ATciEadI15Zeyvebu0u" as string | null,
  cdPrice: "$15",
  cdShipping: "$4 US shipping",
  cdShips: "Ships early November",
};
