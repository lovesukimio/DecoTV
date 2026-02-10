import { NextRequest } from 'next/server';

import {
  GET as searchGetHandler,
  OPTIONS as searchOptionsHandler,
} from './search/route';

export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  return searchGetHandler(request);
}

export async function OPTIONS() {
  return searchOptionsHandler();
}
