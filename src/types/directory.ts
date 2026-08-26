export type DirectoryGroupType = 'office' | 'helpful_numbers' | 'carriers' | 'custom';

export interface DirectoryGroup {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  group_type: DirectoryGroupType;
  address: string | null;
  office_phone: string | null;
  fax: string | null;
  toll_free_phone: string | null;
  email: string | null;
  office_identifiers: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DirectoryEntry {
  id: string;
  group_id: string;
  name: string;
  position: string | null;
  role: string | null;
  sca_code: string | null;
  sub_code: string | null;
  email: string | null;
  ricochet_phone: string | null;
  ring_central_phone: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  notes: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Joined type for display
export interface DirectoryGroupWithEntries extends DirectoryGroup {
  entries: DirectoryEntry[];
  children?: DirectoryGroupWithEntries[];
}
