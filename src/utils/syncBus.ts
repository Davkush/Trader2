export const chartSyncBus = new EventTarget();

export function broadcastLogicalRange(paneId: string, range: any) {
  chartSyncBus.dispatchEvent(new CustomEvent('logical-range', { detail: { paneId, range } }));
}

export function broadcastCrosshair(paneId: string, param: any) {
  chartSyncBus.dispatchEvent(new CustomEvent('crosshair', { detail: { paneId, param } }));
}
