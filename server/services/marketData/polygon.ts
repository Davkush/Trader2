import { CandleData } from '../../../src/types';

interface PolygonAggsResponse {
  results?: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
    t: number;
  }[];
  status: string;
}

export async function fetchPolygonData(symbol: string, timeframe: string, limit = 600): Promise<CandleData[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    throw new Error('POLYGON_API_KEY environment variable is not configured');
  }

  // Map timeframe to Polygon timespan & multiplier
  let multiplier = 1;
  let timespan = 'day';

  switch (timeframe) {
    case '1s':
    case '5s':
    case '1m':
      multiplier = 1;
      timespan = 'minute';
      break;
    case '5m':
      multiplier = 5;
      timespan = 'minute';
      break;
    case '10m':
      multiplier = 10;
      timespan = 'minute';
      break;
    case '15m':
      multiplier = 15;
      timespan = 'minute';
      break;
    case '30m':
      multiplier = 30;
      timespan = 'minute';
      break;
    case '1h':
      multiplier = 1;
      timespan = 'hour';
      break;
    case '2h':
      multiplier = 2;
      timespan = 'hour';
      break;
    case '3h':
      multiplier = 3;
      timespan = 'hour';
      break;
    case '4h':
      multiplier = 4;
      timespan = 'hour';
      break;
    case '1d':
      multiplier = 1;
      timespan = 'day';
      break;
    case '1w':
      multiplier = 1;
      timespan = 'week';
      break;
  }

  // Calculate dynamic "from" date to ensure we get enough candles
  let daysAgo = 365 * 3; // 3 years default
  if (timespan === 'minute') {
    daysAgo = 45; // 45 days is perfect for small charts and stays within limits
  } else if (timespan === 'hour') {
    daysAgo = 200; // 200 days for hourly
  }

  const to = new Date().toISOString().split('T')[0];
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysAgo);
  const from = fromDate.toISOString().split('T')[0];

  const ticker = symbol.toUpperCase();
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=${limit * 2}&apiKey=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Polygon.io API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as PolygonAggsResponse;
  if (data.status !== 'OK' || !data.results) {
    throw new Error(`Polygon.io API status not OK or missing results: ${data.status}`);
  }

  const candles: CandleData[] = data.results.map(item => ({
    time: Math.floor(item.t / 1000), // convert ms to seconds
    open: item.o,
    high: item.h,
    low: item.l,
    close: item.c,
    volume: item.v
  }));

  return candles.slice(-limit);
}
