export const EXPECTED_TAG_PEELS: Record<string, string>;
export function verifyPiDependencies(dependencies: Record<string, string>): string[];
export function verifyTagPeels(actualPeels: Record<string, string>): string[];
export function runIntegrityChecks(root?: string): string[];
