export interface DemoRow {
  campaignId:   string;
  campaignName: string;
  product:      string;
  age:          string;
  gender:       string;
  spend:        number;
  impressions:  number;
  clicks:       number;
  reach:        number;
  installs:     number;
  purchases:    number;
  cpi:          number;
  cpp:          number;
  ctr:          number;
  cpm:          number;
}

export interface PlatformSummary {
  platform:    string;
  spend:       number;
  impressions: number;
  clicks:      number;
  installs:    number;
  cpm:         number;
  ctr:         number;
  cpi:         number;
}

export interface DemographicsResponse {
  rows:             DemoRow[];
  campaigns:        string[];
  products:         string[];
  ageGroups:        string[];
  platformSummary:  PlatformSummary[];
}
