export function toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
}

export function toNullableIsoString(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    return toIsoString(value);
}
