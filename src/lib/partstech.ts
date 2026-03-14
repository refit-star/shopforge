export interface PartsTechCredentials {
  username: string;
  apiKey: string;
}

export interface PartsTechSearchResult {
  part_number: string;
  name: string;
  brand: string;
  price: number;
  list_price: number;
  availability: 'in_stock' | 'special_order' | 'unavailable';
  eta: string | null;
  image_url: string | null;
  category: string;
}

// --- Stubbed implementations (swap for real PartsTech API calls) ---

const MOCK_PARTS: Record<string, PartsTechSearchResult[]> = {
  'brake': [
    { part_number: 'BC1160', name: 'Front Brake Pad Set - Ceramic', brand: 'Bosch', price: 42.99, list_price: 64.99, availability: 'in_stock', eta: null, image_url: null, category: 'Brakes' },
    { part_number: 'CRK14489', name: 'Front Brake Rotor (Pair)', brand: 'Power Stop', price: 78.50, list_price: 110.00, availability: 'in_stock', eta: null, image_url: null, category: 'Brakes' },
    { part_number: 'MKD1169', name: 'Rear Brake Pad Set - Semi-Metallic', brand: 'Motorcraft', price: 38.75, list_price: 55.00, availability: 'in_stock', eta: null, image_url: null, category: 'Brakes' },
    { part_number: 'W0133-1925812', name: 'Brake Caliper - Reman', brand: 'Cardone', price: 89.00, list_price: 134.00, availability: 'special_order', eta: '2-3 days', image_url: null, category: 'Brakes' },
  ],
  'oil': [
    { part_number: 'XO-5W30-5QT', name: 'Full Synthetic Motor Oil 5W-30 (5 Qt)', brand: 'Castrol', price: 28.99, list_price: 38.99, availability: 'in_stock', eta: null, image_url: null, category: 'Fluids' },
    { part_number: 'PF-48E', name: 'Oil Filter', brand: 'AC Delco', price: 8.49, list_price: 12.99, availability: 'in_stock', eta: null, image_url: null, category: 'Filters' },
    { part_number: '51348XP', name: 'Extended Performance Oil Filter', brand: 'WIX', price: 11.99, list_price: 16.49, availability: 'in_stock', eta: null, image_url: null, category: 'Filters' },
  ],
  'spark': [
    { part_number: 'FR7LDC+', name: 'Spark Plug - Copper', brand: 'Bosch', price: 3.29, list_price: 5.49, availability: 'in_stock', eta: null, image_url: null, category: 'Ignition' },
    { part_number: 'SILZKR7B11', name: 'Spark Plug - Iridium', brand: 'NGK', price: 8.99, list_price: 14.99, availability: 'in_stock', eta: null, image_url: null, category: 'Ignition' },
    { part_number: 'SP-546', name: 'Spark Plug - Platinum', brand: 'Motorcraft', price: 7.49, list_price: 11.99, availability: 'special_order', eta: '1-2 days', image_url: null, category: 'Ignition' },
  ],
  'filter': [
    { part_number: 'CA11259', name: 'Air Filter', brand: 'Fram', price: 12.99, list_price: 19.99, availability: 'in_stock', eta: null, image_url: null, category: 'Filters' },
    { part_number: 'CF10285', name: 'Cabin Air Filter - Activated Carbon', brand: 'Denso', price: 16.49, list_price: 24.99, availability: 'in_stock', eta: null, image_url: null, category: 'Filters' },
    { part_number: '33-2480', name: 'High-Flow Air Filter', brand: 'K&N', price: 52.00, list_price: 64.99, availability: 'special_order', eta: '3-5 days', image_url: null, category: 'Filters' },
  ],
  'battery': [
    { part_number: 'H6-AGM', name: 'AGM Battery - Group H6', brand: 'Optima', price: 219.99, list_price: 279.99, availability: 'in_stock', eta: null, image_url: null, category: 'Electrical' },
    { part_number: '35-AGM', name: 'AGM Battery - Group 35', brand: 'AC Delco', price: 179.99, list_price: 229.99, availability: 'in_stock', eta: null, image_url: null, category: 'Electrical' },
  ],
  'belt': [
    { part_number: 'K060882', name: 'Serpentine Belt', brand: 'Gates', price: 24.99, list_price: 37.99, availability: 'in_stock', eta: null, image_url: null, category: 'Belts & Hoses' },
    { part_number: '38386', name: 'Belt Tensioner Assembly', brand: 'Gates', price: 67.50, list_price: 94.99, availability: 'special_order', eta: '1-2 days', image_url: null, category: 'Belts & Hoses' },
  ],
};

const DEFAULT_PARTS: PartsTechSearchResult[] = [
  { part_number: 'BC1160', name: 'Front Brake Pad Set - Ceramic', brand: 'Bosch', price: 42.99, list_price: 64.99, availability: 'in_stock', eta: null, image_url: null, category: 'Brakes' },
  { part_number: 'PF-48E', name: 'Oil Filter', brand: 'AC Delco', price: 8.49, list_price: 12.99, availability: 'in_stock', eta: null, image_url: null, category: 'Filters' },
  { part_number: 'SILZKR7B11', name: 'Spark Plug - Iridium', brand: 'NGK', price: 8.99, list_price: 14.99, availability: 'in_stock', eta: null, image_url: null, category: 'Ignition' },
];

export async function searchParts(
  _credentials: PartsTechCredentials,
  query: string,
  _vehicleInfo?: { year: number; make: string; model: string }
): Promise<PartsTechSearchResult[]> {
  // STUB: Match query against mock data categories
  // TODO: Replace with real PartsTech API call
  const q = query.toLowerCase().trim();
  if (!q) return [];

  for (const [keyword, parts] of Object.entries(MOCK_PARTS)) {
    if (q.includes(keyword)) return parts;
  }

  // Fuzzy: check if any mock part name contains the query
  const all = Object.values(MOCK_PARTS).flat();
  const matches = all.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.part_number.toLowerCase().includes(q) ||
    p.brand.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q)
  );
  return matches.length > 0 ? matches : DEFAULT_PARTS;
}

export async function testConnection(
  credentials: PartsTechCredentials
): Promise<{ success: boolean; message: string }> {
  // STUB: Validate credentials are non-empty
  // TODO: Replace with real PartsTech auth/ping endpoint
  if (!credentials.username || !credentials.apiKey) {
    return { success: false, message: 'Username and API key are required' };
  }
  return { success: true, message: 'Connection successful (stubbed)' };
}
