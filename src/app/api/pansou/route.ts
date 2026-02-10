import { NextRequest } from 'next/server';

import { GET as searchGetHandler } from './search/route';

export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  return searchGetHandler(request);
}
