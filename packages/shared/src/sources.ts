/** A calendar or task list of a data payload: what a tile needs to colour and label its items. */
export interface SourceInfo {
  id: string;
  label: string;
  /** `#rrggbb` chosen by the owner. */
  color: string | null;
}
