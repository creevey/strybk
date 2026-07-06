export interface SerializedRegExp {
  __regexp: true;
  source: string;
  flags: string;
}

export const isSerializedRegExp = (value: unknown): value is SerializedRegExp =>
  typeof value === "object" && value !== null && Reflect.get(value, "__regexp") === true;

export const deserializeRegExp = ({ source, flags }: SerializedRegExp): RegExp =>
  new RegExp(source, flags);
