/** Internal type vocabulary: the three DTCG MVP types plus `text`,
 *  the fold target for Tokens Studio string types (ADR-0016). */
export type DtcgType = "color" | "dimension" | "number" | "text";

export type DtcgLeaf = {
  $type: DtcgType;
  $value: string | number;
  $description?: string;
};

export type DtcgGroup = {
  [key: string]: DtcgGroup | DtcgLeaf;
};

export type Token = {
  /** Slash-joined path inside the file, e.g. "color/blue/500". */
  name: string;
  /** `null` when the token declares no `$type` and none is inherited —
   *  its value is then a reference and the type comes from the target
   *  (DTCG §5.2.2). The resolver fills it in; nothing downstream of
   *  resolve ever sees `null`. */
  type: DtcgType | null;
  /** Either a literal value (string for color/text, number for
   *  dimension/number) or an alias reference `{color.blue.500}` left
   *  unresolved. */
  value: string | number;
  /** Source file this token came from. */
  file: string;
};

export type ParseWarning = {
  file: string;
  path: string;
  reason: string;
};

export type ParseResult = {
  tokens: Token[];
  warnings: ParseWarning[];
};
