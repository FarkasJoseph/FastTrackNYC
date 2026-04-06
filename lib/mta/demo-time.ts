export const MTA_DEMO_REFERENCE_ISO = "2026-04-06T12:00:00.000Z";

export function getMtaDemoReferenceDate() {
  return new Date(MTA_DEMO_REFERENCE_ISO);
}

export function getMtaDemoReferenceMs() {
  return getMtaDemoReferenceDate().getTime();
}

export function getMtaDemoReferenceSeconds() {
  return Math.floor(getMtaDemoReferenceMs() / 1000);
}

