export interface DemoRow {
  campaignId:   string;
  campaignName: string;
  product:      string;
  age:          string;
  gender:       string;
  platform:     string;
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

export interface DemographicsResponse {
  rows:      DemoRow[];
  campaigns: string[];
  products:  string[];
  ageGroups: string[];
  platforms: string[];
}
