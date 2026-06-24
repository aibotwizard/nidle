export type DtcgType = "color" | "dimension" | "number";

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
  type: DtcgType;
  /** Either a literal value (string for color, number for dimension/number)
   *  or an alias reference `{color.blue.500}` left unresolved. */
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
