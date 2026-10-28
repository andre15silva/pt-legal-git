# Button

The one action control: `primary` for the single main action on a view, `quiet` (default) for the rest, `ghost` for inline text actions like "Hoje".

- Provide: `children` (a verb: "Comparar redações", never "OK"), `onClick`, any button attribute.
- One `primary` per view. Primary uses `verde` with `on-verde` text.
- Minimum height 40px (44px touch target with its gap on phone).
- Don't use buttons for navigation to another page; use a link styled with `.rd-link`.
