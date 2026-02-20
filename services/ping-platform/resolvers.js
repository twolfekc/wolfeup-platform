// resolvers.js — 800+ DNS resolver entries
// Each: { id, provider, name, ip, protocol, lat, lng, country, city, region, url? }

const resolvers = [];
let _id = 0;
const add = (provider, name, ip, protocol, lat, lng, country, city, region, url) => {
  resolvers.push({ id: ++_id, provider, name, ip, protocol, lat, lng, country, city, region, url: url || null });
};

// ─── Cloudflare 1.1.1.1 — 48 US PoPs ───────────────────────────────────────
const cfUS = [
  ["Ashburn, VA", 39.0438, -77.4874, "Virginia", "Ashburn"],
  ["Atlanta, GA", 33.7490, -84.3880, "Georgia", "Atlanta"],
  ["Boston, MA", 42.3601, -71.0589, "Massachusetts", "Boston"],
  ["Buffalo, NY", 42.8864, -78.8784, "New York", "Buffalo"],
  ["Charlotte, NC", 35.2271, -80.8431, "North Carolina", "Charlotte"],
  ["Chicago, IL", 41.8781, -87.6298, "Illinois", "Chicago"],
  ["Cincinnati, OH", 39.1031, -84.5120, "Ohio", "Cincinnati"],
  ["Cleveland, OH", 41.4993, -81.6944, "Ohio", "Cleveland"],
  ["Columbus, OH", 39.9612, -82.9988, "Ohio", "Columbus"],
  ["Dallas, TX", 32.7767, -96.7970, "Texas", "Dallas"],
  ["Denver, CO", 39.7392, -104.9903, "Colorado", "Denver"],
  ["Detroit, MI", 42.3314, -83.0458, "Michigan", "Detroit"],
  ["Honolulu, HI", 21.3069, -157.8583, "Hawaii", "Honolulu"],
  ["Houston, TX", 29.7604, -95.3698, "Texas", "Houston"],
  ["Indianapolis, IN", 39.7684, -86.1581, "Indiana", "Indianapolis"],
  ["Jacksonville, FL", 30.3322, -81.6557, "Florida", "Jacksonville"],
  ["Kansas City, MO", 39.0997, -94.5786, "Missouri", "Kansas City"],
  ["Las Vegas, NV", 36.1699, -115.1398, "Nevada", "Las Vegas"],
  ["Los Angeles, CA", 34.0522, -118.2437, "California", "Los Angeles"],
  ["Memphis, TN", 35.1495, -90.0490, "Tennessee", "Memphis"],
  ["Miami, FL", 25.7617, -80.1918, "Florida", "Miami"],
  ["Milwaukee, WI", 43.0389, -87.9065, "Wisconsin", "Milwaukee"],
  ["Minneapolis, MN", 44.9778, -93.2650, "Minnesota", "Minneapolis"],
  ["Nashville, TN", 36.1627, -86.7816, "Tennessee", "Nashville"],
  ["Newark, NJ", 40.7357, -74.1724, "New Jersey", "Newark"],
  ["New York, NY", 40.7128, -74.0060, "New York", "New York"],
  ["Norfolk, VA", 36.8508, -76.2859, "Virginia", "Norfolk"],
  ["Oklahoma City, OK", 35.4676, -97.5164, "Oklahoma", "Oklahoma City"],
  ["Omaha, NE", 41.2565, -95.9345, "Nebraska", "Omaha"],
  ["Philadelphia, PA", 39.9526, -75.1652, "Pennsylvania", "Philadelphia"],
  ["Phoenix, AZ", 33.4484, -112.0740, "Arizona", "Phoenix"],
  ["Pittsburgh, PA", 40.4406, -79.9959, "Pennsylvania", "Pittsburgh"],
  ["Portland, OR", 45.5152, -122.6784, "Oregon", "Portland"],
  ["Raleigh, NC", 35.7796, -78.6382, "North Carolina", "Raleigh"],
  ["Richmond, VA", 37.5407, -77.4360, "Virginia", "Richmond"],
  ["Sacramento, CA", 38.5816, -121.4944, "California", "Sacramento"],
  ["Salt Lake City, UT", 40.7608, -111.8910, "Utah", "Salt Lake City"],
  ["San Antonio, TX", 29.4241, -98.4936, "Texas", "San Antonio"],
  ["San Diego, CA", 32.7157, -117.1611, "California", "San Diego"],
  ["San Francisco, CA", 37.7749, -122.4194, "California", "San Francisco"],
  ["San Jose, CA", 37.3382, -121.8863, "California", "San Jose"],
  ["Seattle, WA", 47.6062, -122.3321, "Washington", "Seattle"],
  ["St. Louis, MO", 38.6270, -90.1994, "Missouri", "St. Louis"],
  ["Tampa, FL", 27.9506, -82.4572, "Florida", "Tampa"],
  ["Tucson, AZ", 32.2226, -110.9747, "Arizona", "Tucson"],
  ["Washington, DC", 38.9072, -77.0369, "District of Columbia", "Washington"],
  ["Austin, TX", 30.2672, -97.7431, "Texas", "Austin"],
  ["Albuquerque, NM", 35.0844, -106.6504, "New Mexico", "Albuquerque"],
];
cfUS.forEach(([name, lat, lng, region, city]) => {
  add("Cloudflare", `CF ${city}`, "1.1.1.1", "dns", lat, lng, "US", city, region);
});
// Cloudflare DoH
cfUS.forEach(([name, lat, lng, region, city]) => {
  add("Cloudflare", `CF DoH ${city}`, "1.1.1.1", "doh", lat, lng, "US", city, region, "https://cloudflare-dns.com/dns-query");
});

// ─── Google DNS — US PoPs ────────────────────────────────────────────────────
const googlePoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Council Bluffs", 41.2619, -95.8608, "Iowa"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Houston", 29.7604, -95.3698, "Texas"],
  ["Jacksonville", 30.3322, -81.6557, "Florida"],
  ["Kansas City", 39.0997, -94.5786, "Missouri"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["Minneapolis", 44.9778, -93.2650, "Minnesota"],
  ["Nashville", 36.1627, -86.7816, "Tennessee"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Newark", 40.7357, -74.1724, "New Jersey"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
  ["Portland", 45.5152, -122.6784, "Oregon"],
  ["Salt Lake City", 40.7608, -111.8910, "Utah"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["San Jose", 37.3382, -121.8863, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["St. Louis", 38.6270, -90.1994, "Missouri"],
  ["Washington DC", 38.9072, -77.0369, "DC"],
];
googlePoPs.forEach(([city, lat, lng, region]) => {
  add("Google", `Google DNS ${city}`, "8.8.8.8", "dns", lat, lng, "US", city, region);
  add("Google", `Google DNS2 ${city}`, "8.8.4.4", "dns", lat, lng, "US", city, region);
});
// Google DoH
add("Google", "Google DoH Primary", "8.8.8.8", "doh", 37.4220, -122.0841, "US", "Mountain View", "California", "https://dns.google/dns-query");
add("Google", "Google DoH Secondary", "8.8.4.4", "doh", 37.4220, -122.0841, "US", "Mountain View", "California", "https://dns.google/dns-query");

// ─── Quad9 — US PoPs ─────────────────────────────────────────────────────────
const quad9PoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Boston", 42.3601, -71.0589, "Massachusetts"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Houston", 29.7604, -95.3698, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["Minneapolis", 44.9778, -93.2650, "Minnesota"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["San Jose", 37.3382, -121.8863, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Washington DC", 38.9072, -77.0369, "DC"],
];
quad9PoPs.forEach(([city, lat, lng, region]) => {
  add("Quad9", `Quad9 ${city}`, "9.9.9.9", "dns", lat, lng, "US", city, region);
  add("Quad9", `Quad9 Unsecured ${city}`, "9.9.9.10", "dns", lat, lng, "US", city, region);
});
add("Quad9", "Quad9 DoH", "9.9.9.9", "doh", 40.7128, -74.0060, "US", "New York", "New York", "https://dns.quad9.net/dns-query");

// ─── OpenDNS / Cisco ─────────────────────────────────────────────────────────
const opendnsPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["San Jose", 37.3382, -121.8863, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Washington DC", 38.9072, -77.0369, "DC"],
];
opendnsPoPs.forEach(([city, lat, lng, region]) => {
  add("OpenDNS", `OpenDNS ${city}`, "208.67.222.222", "dns", lat, lng, "US", city, region);
  add("OpenDNS", `OpenDNS FamilyShield ${city}`, "208.67.222.123", "dns", lat, lng, "US", city, region);
});
add("OpenDNS", "OpenDNS DoH", "208.67.222.222", "doh", 37.3382, -121.8863, "US", "San Jose", "California", "https://doh.opendns.com/dns-query");

// ─── Level3 / Lumen ──────────────────────────────────────────────────────────
["4.2.2.1", "4.2.2.2", "4.2.2.3", "4.2.2.4", "4.2.2.5", "4.2.2.6"].forEach((ip, i) => {
  const cities = [
    ["New York", 40.7128, -74.0060, "New York"],
    ["Chicago", 41.8781, -87.6298, "Illinois"],
    ["Dallas", 32.7767, -96.7970, "Texas"],
    ["Los Angeles", 34.0522, -118.2437, "California"],
    ["Ashburn", 39.0438, -77.4874, "Virginia"],
    ["Denver", 39.7392, -104.9903, "Colorado"],
  ];
  const [city, lat, lng, region] = cities[i];
  add("Level3/Lumen", `Level3 ${ip} ${city}`, ip, "dns", lat, lng, "US", city, region);
});

// ─── Verisign ────────────────────────────────────────────────────────────────
add("Verisign", "Verisign Primary", "64.6.64.6", "dns", 38.9500, -77.3464, "US", "Reston", "Virginia");
add("Verisign", "Verisign Secondary", "64.6.65.6", "dns", 38.9500, -77.3464, "US", "Reston", "Virginia");

// ─── Neustar UltraDNS ────────────────────────────────────────────────────────
const neustarEntries = [
  ["Neustar Unfiltered 1", "64.6.64.6"],
  ["Neustar Unfiltered 2", "156.154.70.1"],
  ["Neustar Threat Protection 1", "156.154.70.2"],
  ["Neustar Threat Protection 2", "156.154.71.2"],
  ["Neustar Family Secure 1", "156.154.70.3"],
  ["Neustar Family Secure 2", "156.154.71.3"],
  ["Neustar Business Secure 1", "156.154.70.4"],
  ["Neustar Business Secure 2", "156.154.71.4"],
];
neustarEntries.forEach(([name, ip]) => {
  add("Neustar", name, ip, "dns", 39.0438, -77.4874, "US", "Ashburn", "Virginia");
});

// ─── Comodo Secure DNS ───────────────────────────────────────────────────────
add("Comodo", "Comodo Secure DNS 1", "8.26.56.26", "dns", 40.7128, -74.0060, "US", "New York", "New York");
add("Comodo", "Comodo Secure DNS 2", "8.20.247.20", "dns", 34.0522, -118.2437, "US", "Los Angeles", "California");

// ─── Hurricane Electric ──────────────────────────────────────────────────────
add("Hurricane Electric", "HE DNS 1", "74.82.42.42", "dns", 37.3861, -122.0839, "US", "Fremont", "California");
add("Hurricane Electric", "HE DNS 2", "66.220.18.42", "dns", 37.3861, -122.0839, "US", "Fremont", "California");

// ─── AdGuard ─────────────────────────────────────────────────────────────────
add("AdGuard", "AdGuard Default 1", "94.140.14.14", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("AdGuard", "AdGuard Default 2", "94.140.15.15", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("AdGuard", "AdGuard Family 1", "94.140.14.15", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("AdGuard", "AdGuard Family 2", "94.140.15.16", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("AdGuard", "AdGuard Non-filter 1", "94.140.14.140", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("AdGuard", "AdGuard Non-filter 2", "94.140.14.141", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("AdGuard", "AdGuard DoH Default", "94.140.14.14", "doh", 55.7558, 37.6173, "RU", "Moscow", "Moscow", "https://dns.adguard-dns.com/dns-query");
add("AdGuard", "AdGuard DoH Family", "94.140.14.15", "doh", 55.7558, 37.6173, "RU", "Moscow", "Moscow", "https://family.adguard-dns.com/dns-query");

// ─── NextDNS ─────────────────────────────────────────────────────────────────
const nextdnsPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia", "US"],
  ["Chicago", 41.8781, -87.6298, "Illinois", "US"],
  ["Dallas", 32.7767, -96.7970, "Texas", "US"],
  ["Los Angeles", 34.0522, -118.2437, "California", "US"],
  ["Miami", 25.7617, -80.1918, "Florida", "US"],
  ["New York", 40.7128, -74.0060, "New York", "US"],
  ["San Francisco", 37.7749, -122.4194, "California", "US"],
  ["Seattle", 47.6062, -122.3321, "Washington", "US"],
  ["Atlanta", 33.7490, -84.3880, "Georgia", "US"],
  ["Denver", 39.7392, -104.9903, "Colorado", "US"],
  ["Phoenix", 33.4484, -112.0740, "Arizona", "US"],
  ["Portland", 45.5152, -122.6784, "Oregon", "US"],
];
nextdnsPoPs.forEach(([city, lat, lng, region, country]) => {
  add("NextDNS", `NextDNS ${city}`, "45.90.28.0", "dns", lat, lng, country, city, region);
});
add("NextDNS", "NextDNS DoH", "45.90.28.0", "doh", 37.7749, -122.4194, "US", "San Francisco", "California", "https://dns.nextdns.io/dns-query");

// ─── Mullvad ─────────────────────────────────────────────────────────────────
const mullvadPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia", "US"],
  ["Atlanta", 33.7490, -84.3880, "Georgia", "US"],
  ["Chicago", 41.8781, -87.6298, "Illinois", "US"],
  ["Dallas", 32.7767, -96.7970, "Texas", "US"],
  ["Los Angeles", 34.0522, -118.2437, "California", "US"],
  ["Miami", 25.7617, -80.1918, "Florida", "US"],
  ["New York", 40.7128, -74.0060, "New York", "US"],
  ["San Jose", 37.3382, -121.8863, "California", "US"],
  ["Seattle", 47.6062, -122.3321, "Washington", "US"],
];
mullvadPoPs.forEach(([city, lat, lng, region, country]) => {
  add("Mullvad", `Mullvad ${city}`, "194.242.2.2", "dns", lat, lng, country, city, region);
});
add("Mullvad", "Mullvad DoH", "194.242.2.2", "doh", 59.3293, 18.0686, "SE", "Stockholm", "Stockholm", "https://dns.mullvad.net/dns-query");

// ─── ControlD ────────────────────────────────────────────────────────────────
const controldPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia", "US"],
  ["Chicago", 41.8781, -87.6298, "Illinois", "US"],
  ["Dallas", 32.7767, -96.7970, "Texas", "US"],
  ["Los Angeles", 34.0522, -118.2437, "California", "US"],
  ["Miami", 25.7617, -80.1918, "Florida", "US"],
  ["New York", 40.7128, -74.0060, "New York", "US"],
  ["San Francisco", 37.7749, -122.4194, "California", "US"],
  ["Seattle", 47.6062, -122.3321, "Washington", "US"],
];
controldPoPs.forEach(([city, lat, lng, region, country]) => {
  add("ControlD", `ControlD ${city}`, "76.76.2.0", "dns", lat, lng, country, city, region);
});
add("ControlD", "ControlD DoH", "76.76.2.0", "doh", 43.6532, -79.3832, "CA", "Toronto", "Ontario", "https://freedns.controld.com/p0");

// ─── CleanBrowsing ───────────────────────────────────────────────────────────
add("CleanBrowsing", "CleanBrowsing Security 1", "185.228.168.9", "dns", 39.0438, -77.4874, "US", "Ashburn", "Virginia");
add("CleanBrowsing", "CleanBrowsing Security 2", "185.228.169.9", "dns", 39.0438, -77.4874, "US", "Ashburn", "Virginia");
add("CleanBrowsing", "CleanBrowsing Adult 1", "185.228.168.10", "dns", 39.0438, -77.4874, "US", "Ashburn", "Virginia");
add("CleanBrowsing", "CleanBrowsing Adult 2", "185.228.169.11", "dns", 39.0438, -77.4874, "US", "Ashburn", "Virginia");
add("CleanBrowsing", "CleanBrowsing Family 1", "185.228.168.168", "dns", 39.0438, -77.4874, "US", "Ashburn", "Virginia");
add("CleanBrowsing", "CleanBrowsing Family 2", "185.228.169.168", "dns", 39.0438, -77.4874, "US", "Ashburn", "Virginia");
add("CleanBrowsing", "CleanBrowsing DoH Security", "185.228.168.9", "doh", 39.0438, -77.4874, "US", "Ashburn", "Virginia", "https://doh.cleanbrowsing.org/doh/security-filter/");
add("CleanBrowsing", "CleanBrowsing DoH Family", "185.228.168.168", "doh", 39.0438, -77.4874, "US", "Ashburn", "Virginia", "https://doh.cleanbrowsing.org/doh/family-filter/");

// ─── DNS.SB ──────────────────────────────────────────────────────────────────
add("DNS.SB", "DNS.SB Primary", "185.222.222.222", "dns", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse");
add("DNS.SB", "DNS.SB Secondary", "45.11.45.11", "dns", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse");
add("DNS.SB", "DNS.SB DoH", "185.222.222.222", "doh", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse", "https://doh.dns.sb/dns-query");

// ─── LibreDNS ────────────────────────────────────────────────────────────────
add("LibreDNS", "LibreDNS", "116.202.176.26", "dns", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse");
add("LibreDNS", "LibreDNS DoH", "116.202.176.26", "doh", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse", "https://doh.libredns.gr/dns-query");

// ─── RethinkDNS ──────────────────────────────────────────────────────────────
const rethinkPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia", "US"],
  ["Chicago", 41.8781, -87.6298, "Illinois", "US"],
  ["Dallas", 32.7767, -96.7970, "Texas", "US"],
  ["Los Angeles", 34.0522, -118.2437, "California", "US"],
  ["New York", 40.7128, -74.0060, "New York", "US"],
  ["San Francisco", 37.7749, -122.4194, "California", "US"],
  ["Seattle", 47.6062, -122.3321, "Washington", "US"],
  ["Miami", 25.7617, -80.1918, "Florida", "US"],
];
rethinkPoPs.forEach(([city, lat, lng, region, country]) => {
  add("RethinkDNS", `RethinkDNS ${city}`, "76.76.19.19", "dns", lat, lng, country, city, region);
});
add("RethinkDNS", "RethinkDNS DoH", "76.76.19.19", "doh", 37.7749, -122.4194, "US", "San Francisco", "California", "https://basic.rethinkdns.com/dns-query");

// ─── International Resolvers ─────────────────────────────────────────────────
// AliDNS (China)
add("AliDNS", "AliDNS Primary", "223.5.5.5", "dns", 30.2741, 120.1551, "CN", "Hangzhou", "Zhejiang");
add("AliDNS", "AliDNS Secondary", "223.6.6.6", "dns", 30.2741, 120.1551, "CN", "Hangzhou", "Zhejiang");
add("AliDNS", "AliDNS DoH", "223.5.5.5", "doh", 30.2741, 120.1551, "CN", "Hangzhou", "Zhejiang", "https://dns.alidns.com/dns-query");

// DNSPod / Tencent (China)
add("DNSPod", "DNSPod Primary", "119.29.29.29", "dns", 22.5431, 114.0579, "CN", "Shenzhen", "Guangdong");
add("DNSPod", "DNSPod Secondary", "182.254.116.116", "dns", 22.5431, 114.0579, "CN", "Shenzhen", "Guangdong");
add("DNSPod", "DNSPod DoH", "119.29.29.29", "doh", 22.5431, 114.0579, "CN", "Shenzhen", "Guangdong", "https://doh.pub/dns-query");

// Yandex (Russia)
add("Yandex", "Yandex Basic 1", "77.88.8.8", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("Yandex", "Yandex Basic 2", "77.88.8.1", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("Yandex", "Yandex Safe 1", "77.88.8.88", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("Yandex", "Yandex Safe 2", "77.88.8.2", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("Yandex", "Yandex Family 1", "77.88.8.7", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("Yandex", "Yandex Family 2", "77.88.8.3", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");

// CIRA Canadian Shield
add("CIRA", "CIRA Private 1", "149.112.121.10", "dns", 45.4215, -75.6972, "CA", "Ottawa", "Ontario");
add("CIRA", "CIRA Private 2", "149.112.122.10", "dns", 45.4215, -75.6972, "CA", "Ottawa", "Ontario");
add("CIRA", "CIRA Protected 1", "149.112.121.20", "dns", 45.4215, -75.6972, "CA", "Ottawa", "Ontario");
add("CIRA", "CIRA Protected 2", "149.112.122.20", "dns", 45.4215, -75.6972, "CA", "Ottawa", "Ontario");
add("CIRA", "CIRA Family 1", "149.112.121.30", "dns", 45.4215, -75.6972, "CA", "Ottawa", "Ontario");
add("CIRA", "CIRA Family 2", "149.112.122.30", "dns", 45.4215, -75.6972, "CA", "Ottawa", "Ontario");
add("CIRA", "CIRA DoH Private", "149.112.121.10", "doh", 45.4215, -75.6972, "CA", "Ottawa", "Ontario", "https://private.canadianshield.cira.ca/dns-query");

// TWNIC (Taiwan)
add("TWNIC", "TWNIC Primary", "101.101.101.101", "dns", 25.0330, 121.5654, "TW", "Taipei", "Taiwan");
add("TWNIC", "TWNIC Secondary", "101.102.103.104", "dns", 25.0330, 121.5654, "TW", "Taipei", "Taiwan");
add("TWNIC", "TWNIC DoH", "101.101.101.101", "doh", 25.0330, 121.5654, "TW", "Taipei", "Taiwan", "https://dns.twnic.tw/dns-query");

// ─── Additional US/Global Resolvers ──────────────────────────────────────────
// Alternate DNS
add("Alternate DNS", "Alternate DNS 1", "76.76.19.19", "dns", 40.7128, -74.0060, "US", "New York", "New York");
add("Alternate DNS", "Alternate DNS 2", "76.223.122.150", "dns", 34.0522, -118.2437, "US", "Los Angeles", "California");

// UncensoredDNS (Denmark)
add("UncensoredDNS", "UncensoredDNS Anycast", "91.239.100.100", "dns", 55.6761, 12.5683, "DK", "Copenhagen", "Capital Region");
add("UncensoredDNS", "UncensoredDNS Unicast", "89.233.43.71", "dns", 55.6761, 12.5683, "DK", "Copenhagen", "Capital Region");

// Freenom World
add("Freenom", "Freenom World 1", "80.80.80.80", "dns", 52.3676, 4.9041, "NL", "Amsterdam", "North Holland");
add("Freenom", "Freenom World 2", "80.80.81.81", "dns", 52.3676, 4.9041, "NL", "Amsterdam", "North Holland");

// Safe DNS
add("SafeDNS", "SafeDNS 1", "195.46.39.39", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");
add("SafeDNS", "SafeDNS 2", "195.46.39.40", "dns", 55.7558, 37.6173, "RU", "Moscow", "Moscow");

// Dyn / Oracle
add("Dyn", "Dyn Primary", "216.146.35.35", "dns", 42.3601, -71.0589, "US", "Boston", "Massachusetts");
add("Dyn", "Dyn Secondary", "216.146.36.36", "dns", 42.3601, -71.0589, "US", "Boston", "Massachusetts");

// puntCAT (Catalonia)
add("puntCAT", "puntCAT", "109.69.8.51", "dns", 41.3851, 2.1734, "ES", "Barcelona", "Catalonia");

// Nawala (Indonesia)
add("Nawala", "Nawala 1", "180.131.144.144", "dns", -6.2088, 106.8456, "ID", "Jakarta", "Jakarta");
add("Nawala", "Nawala 2", "180.131.145.145", "dns", -6.2088, 106.8456, "ID", "Jakarta", "Jakarta");

// CZ.NIC ODVR (Czech Republic)
add("CZ.NIC", "ODVR Primary", "193.17.47.1", "dns", 50.0755, 14.4378, "CZ", "Prague", "Prague");
add("CZ.NIC", "ODVR Secondary", "185.43.135.1", "dns", 50.0755, 14.4378, "CZ", "Prague", "Prague");
add("CZ.NIC", "ODVR DoH", "193.17.47.1", "doh", 50.0755, 14.4378, "CZ", "Prague", "Prague", "https://odvr.nic.cz/doh");

// Digitale Gesellschaft (Switzerland)
add("Digitale Gesellschaft", "DG DNS 1", "185.95.218.42", "dns", 47.3769, 8.5417, "CH", "Zurich", "Zurich");
add("Digitale Gesellschaft", "DG DNS 2", "185.95.218.43", "dns", 47.3769, 8.5417, "CH", "Zurich", "Zurich");

// Applied Privacy (Austria)
add("Applied Privacy", "AppliedPrivacy", "146.255.56.98", "dns", 48.2082, 16.3738, "AT", "Vienna", "Vienna");
add("Applied Privacy", "AppliedPrivacy DoH", "146.255.56.98", "doh", 48.2082, 16.3738, "AT", "Vienna", "Vienna", "https://doh.applied-privacy.net/query");

// Foundation for Applied Privacy
add("FFMUC", "FFMUC DoH", "5.1.66.255", "doh", 48.1351, 11.5820, "DE", "Munich", "Bavaria", "https://doh.ffmuc.net/dns-query");

// Blah DNS
add("BlahDNS", "BlahDNS JP", "45.32.55.94", "dns", 35.6762, 139.6503, "JP", "Tokyo", "Kanto");
add("BlahDNS", "BlahDNS DE", "78.46.244.143", "dns", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse");
add("BlahDNS", "BlahDNS SG", "139.59.48.222", "dns", 1.3521, 103.8198, "SG", "Singapore", "Singapore");
add("BlahDNS", "BlahDNS FI", "95.216.212.177", "dns", 60.1699, 24.9384, "FI", "Helsinki", "Uusimaa");

// Pi-hole community resolvers
add("DNS.Watch", "DNS.Watch 1", "84.200.69.80", "dns", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse");
add("DNS.Watch", "DNS.Watch 2", "84.200.70.40", "dns", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse");

// Tiarapp (Indonesia)
add("Tiarapp", "Tiarapp Primary", "174.138.21.128", "dns", 1.3521, 103.8198, "SG", "Singapore", "Singapore");

// SWITCH DNS (Switzerland)
add("SWITCH", "SWITCH DNS 1", "130.59.31.248", "dns", 47.3769, 8.5417, "CH", "Zurich", "Zurich");
add("SWITCH", "SWITCH DNS 2", "130.59.31.251", "dns", 47.3769, 8.5417, "CH", "Zurich", "Zurich");

// Surfnet (Netherlands)
add("SURFnet", "SURFnet", "145.100.185.15", "dns", 52.3676, 4.9041, "NL", "Amsterdam", "North Holland");

// CNNIC (China)
add("CNNIC", "CNNIC SDNS 1", "1.2.4.8", "dns", 39.9042, 116.4074, "CN", "Beijing", "Beijing");
add("CNNIC", "CNNIC SDNS 2", "210.2.4.8", "dns", 39.9042, 116.4074, "CN", "Beijing", "Beijing");

// 360 Secure DNS (China)
add("360 DNS", "360 DNS 1", "101.226.4.6", "dns", 31.2304, 121.4737, "CN", "Shanghai", "Shanghai");
add("360 DNS", "360 DNS 2", "218.30.118.6", "dns", 39.9042, 116.4074, "CN", "Beijing", "Beijing");
add("360 DNS", "360 DoH", "101.226.4.6", "doh", 31.2304, 121.4737, "CN", "Shanghai", "Shanghai", "https://doh.360.cn/dns-query");

// Quad 101 (TWNIC)
add("Quad101", "Quad101 Primary", "101.101.101.101", "dns", 25.0330, 121.5654, "TW", "Taipei", "Taiwan");

// Telia (Sweden)
add("Telia", "Telia Carrier 1", "213.248.225.2", "dns", 59.3293, 18.0686, "SE", "Stockholm", "Stockholm");

// IIJ (Japan)
add("IIJ", "IIJ Public DNS", "210.130.0.1", "dns", 35.6762, 139.6503, "JP", "Tokyo", "Kanto");

// JPRS (Japan)
add("JPRS", "JPRS Primary", "210.171.224.1", "dns", 35.6762, 139.6503, "JP", "Tokyo", "Kanto");
add("JPRS", "JPRS Secondary", "202.12.30.131", "dns", 35.6762, 139.6503, "JP", "Tokyo", "Kanto");

// WIDE Project (Japan)
add("WIDE", "WIDE DNS", "210.152.135.178", "dns", 35.6762, 139.6503, "JP", "Tokyo", "Kanto");

// Korean Telecom
add("KT", "KT DNS 1", "168.126.63.1", "dns", 37.5665, 126.9780, "KR", "Seoul", "Seoul");
add("KT", "KT DNS 2", "168.126.63.2", "dns", 37.5665, 126.9780, "KR", "Seoul", "Seoul");

// LG Uplus (Korea)
add("LG Uplus", "LG Uplus DNS 1", "164.124.101.2", "dns", 37.5665, 126.9780, "KR", "Seoul", "Seoul");
add("LG Uplus", "LG Uplus DNS 2", "203.248.252.2", "dns", 37.5665, 126.9780, "KR", "Seoul", "Seoul");

// SK Broadband (Korea)
add("SK", "SK DNS 1", "210.220.163.82", "dns", 37.5665, 126.9780, "KR", "Seoul", "Seoul");
add("SK", "SK DNS 2", "219.250.36.130", "dns", 37.5665, 126.9780, "KR", "Seoul", "Seoul");

// Telstra (Australia)
add("Telstra", "Telstra DNS 1", "139.130.4.5", "dns", -33.8688, 151.2093, "AU", "Sydney", "NSW");

// TPG (Australia)
add("TPG", "TPG DNS 1", "203.12.160.35", "dns", -33.8688, 151.2093, "AU", "Sydney", "NSW");
add("TPG", "TPG DNS 2", "203.12.160.36", "dns", -33.8688, 151.2093, "AU", "Sydney", "NSW");

// Optus (Australia)
add("Optus", "Optus DNS 1", "211.29.132.12", "dns", -33.8688, 151.2093, "AU", "Sydney", "NSW");

// Vodafone (Germany)
add("Vodafone DE", "Vodafone DNS 1", "139.7.30.126", "dns", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse");

// Deutsche Telekom
add("Deutsche Telekom", "DT DNS 1", "217.237.150.33", "dns", 50.1109, 8.6821, "DE", "Frankfurt", "Hesse");

// Strato (Germany)
add("Strato", "Strato DNS 1", "81.169.163.106", "dns", 52.5200, 13.4050, "DE", "Berlin", "Berlin");

// OVH (France)
add("OVH", "OVH DNS", "213.186.33.99", "dns", 50.6292, 3.0573, "FR", "Roubaix", "Hauts-de-France");

// Free.fr (France)
add("Free.fr", "Free DNS 1", "212.27.40.240", "dns", 48.8566, 2.3522, "FR", "Paris", "Île-de-France");
add("Free.fr", "Free DNS 2", "212.27.40.241", "dns", 48.8566, 2.3522, "FR", "Paris", "Île-de-France");

// SFR (France)
add("SFR", "SFR DNS 1", "109.0.66.10", "dns", 48.8566, 2.3522, "FR", "Paris", "Île-de-France");

// BT (UK)
add("BT", "BT DNS 1", "217.32.37.1", "dns", 51.5074, -0.1278, "GB", "London", "England");

// Virgin Media (UK)
add("Virgin Media", "Virgin DNS 1", "194.168.4.100", "dns", 51.5074, -0.1278, "GB", "London", "England");

// Sky UK
add("Sky UK", "Sky DNS 1", "90.207.238.97", "dns", 51.5074, -0.1278, "GB", "London", "England");

// Telefonica/Movistar (Spain)
add("Telefonica", "Telefonica DNS 1", "80.58.61.250", "dns", 40.4168, -3.7038, "ES", "Madrid", "Madrid");
add("Telefonica", "Telefonica DNS 2", "80.58.61.254", "dns", 40.4168, -3.7038, "ES", "Madrid", "Madrid");

// Tiscali (Italy)
add("Tiscali", "Tiscali DNS 1", "213.205.32.70", "dns", 39.2238, 9.1217, "IT", "Cagliari", "Sardinia");

// Fastweb (Italy)
add("Fastweb", "Fastweb DNS 1", "85.18.200.200", "dns", 45.4642, 9.1900, "IT", "Milan", "Lombardy");

// Swisscom
add("Swisscom", "Swisscom DNS", "195.186.1.111", "dns", 46.9480, 7.4474, "CH", "Bern", "Bern");

// A1 Telekom (Austria)
add("A1", "A1 DNS 1", "195.3.96.67", "dns", 48.2082, 16.3738, "AT", "Vienna", "Vienna");

// Proximus (Belgium)
add("Proximus", "Proximus DNS 1", "195.238.2.21", "dns", 50.8503, 4.3517, "BE", "Brussels", "Brussels");

// Ziggo (Netherlands)
add("Ziggo", "Ziggo DNS 1", "213.46.228.196", "dns", 52.3676, 4.9041, "NL", "Amsterdam", "North Holland");

// KPN (Netherlands)
add("KPN", "KPN DNS 1", "145.97.5.2", "dns", 52.3676, 4.9041, "NL", "Amsterdam", "North Holland");

// Telenor (Norway)
add("Telenor", "Telenor DNS 1", "217.13.4.24", "dns", 59.9139, 10.7522, "NO", "Oslo", "Oslo");

// Telia (Finland)
add("Telia FI", "Telia FI DNS 1", "195.74.0.47", "dns", 60.1699, 24.9384, "FI", "Helsinki", "Uusimaa");

// Elisa (Finland)
add("Elisa", "Elisa DNS 1", "195.74.0.47", "dns", 60.1699, 24.9384, "FI", "Helsinki", "Uusimaa");

// Tele2 (Sweden)
add("Tele2", "Tele2 DNS 1", "130.244.127.161", "dns", 59.3293, 18.0686, "SE", "Stockholm", "Stockholm");

// TDC (Denmark)
add("TDC", "TDC DNS 1", "193.162.153.164", "dns", 55.6761, 12.5683, "DK", "Copenhagen", "Capital Region");

// Bahnhof (Sweden)
add("Bahnhof", "Bahnhof DNS 1", "5.45.96.220", "dns", 59.3293, 18.0686, "SE", "Stockholm", "Stockholm");

// Turk Telekom
add("Turk Telekom", "TT DNS 1", "195.175.39.39", "dns", 41.0082, 28.9784, "TR", "Istanbul", "Marmara");
add("Turk Telekom", "TT DNS 2", "195.175.39.40", "dns", 41.0082, 28.9784, "TR", "Istanbul", "Marmara");

// SingTel (Singapore)
add("SingTel", "SingTel DNS 1", "165.21.100.88", "dns", 1.3521, 103.8198, "SG", "Singapore", "Singapore");

// StarHub (Singapore)
add("StarHub", "StarHub DNS 1", "203.116.165.124", "dns", 1.3521, 103.8198, "SG", "Singapore", "Singapore");

// PLDT (Philippines)
add("PLDT", "PLDT DNS", "119.92.200.57", "dns", 14.5995, 120.9842, "PH", "Manila", "NCR");

// Bharti Airtel (India)
add("Airtel", "Airtel DNS", "122.179.12.33", "dns", 28.6139, 77.2090, "IN", "New Delhi", "Delhi");

// BSNL (India)
add("BSNL", "BSNL DNS", "210.212.252.9", "dns", 28.6139, 77.2090, "IN", "New Delhi", "Delhi");

// Jio (India)
add("Jio", "Jio DNS", "49.44.121.24", "dns", 19.0760, 72.8777, "IN", "Mumbai", "Maharashtra");

// Etisalat (UAE)
add("Etisalat", "Etisalat DNS", "213.42.20.20", "dns", 25.2048, 55.2708, "AE", "Dubai", "Dubai");

// STC (Saudi Arabia)
add("STC", "STC DNS", "212.118.241.1", "dns", 24.7136, 46.6753, "SA", "Riyadh", "Riyadh");

// Bezeq (Israel)
add("Bezeq", "Bezeq DNS", "192.114.14.161", "dns", 32.0853, 34.7818, "IL", "Tel Aviv", "Tel Aviv");

// MTN (South Africa)
add("MTN", "MTN DNS", "196.11.235.16", "dns", -26.2041, 28.0473, "ZA", "Johannesburg", "Gauteng");

// Telkom SA
add("Telkom SA", "Telkom DNS", "196.7.0.138", "dns", -33.9249, 18.4241, "ZA", "Cape Town", "Western Cape");

// América Móvil / Telmex (Mexico)
add("Telmex", "Telmex DNS 1", "200.33.146.217", "dns", 19.4326, -99.1332, "MX", "Mexico City", "CDMX");
add("Telmex", "Telmex DNS 2", "200.33.146.220", "dns", 19.4326, -99.1332, "MX", "Mexico City", "CDMX");

// Claro (Brazil)
add("Claro BR", "Claro DNS", "200.248.178.54", "dns", -23.5505, -46.6333, "BR", "São Paulo", "São Paulo");

// Vivo (Brazil)
add("Vivo", "Vivo DNS", "200.204.0.10", "dns", -23.5505, -46.6333, "BR", "São Paulo", "São Paulo");

// NIC.br (Brazil)
add("NIC.br", "NIC.br DNS", "200.160.2.3", "dns", -23.5505, -46.6333, "BR", "São Paulo", "São Paulo");

// CenturyLink/Lumen US PoPs
const centuryPops = [
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Boston", 42.3601, -71.0589, "Massachusetts"],
  ["Charlotte", 35.2271, -80.8431, "North Carolina"],
  ["Detroit", 42.3314, -83.0458, "Michigan"],
  ["Honolulu", 21.3069, -157.8583, "Hawaii"],
  ["Indianapolis", 39.7684, -86.1581, "Indiana"],
  ["Jacksonville", 30.3322, -81.6557, "Florida"],
  ["Las Vegas", 36.1699, -115.1398, "Nevada"],
  ["Memphis", 35.1495, -90.0490, "Tennessee"],
  ["Milwaukee", 43.0389, -87.9065, "Wisconsin"],
  ["Nashville", 36.1627, -86.7816, "Tennessee"],
  ["New Orleans", 29.9511, -90.0715, "Louisiana"],
  ["Norfolk", 36.8508, -76.2859, "Virginia"],
  ["Oklahoma City", 35.4676, -97.5164, "Oklahoma"],
  ["Omaha", 41.2565, -95.9345, "Nebraska"],
  ["Orlando", 28.5383, -81.3792, "Florida"],
  ["Philadelphia", 39.9526, -75.1652, "Pennsylvania"],
  ["Pittsburgh", 40.4406, -79.9959, "Pennsylvania"],
  ["Portland", 45.5152, -122.6784, "Oregon"],
  ["Raleigh", 35.7796, -78.6382, "North Carolina"],
  ["Sacramento", 38.5816, -121.4944, "California"],
  ["Salt Lake City", 40.7608, -111.8910, "Utah"],
  ["San Antonio", 29.4241, -98.4936, "Texas"],
  ["San Diego", 32.7157, -117.1611, "California"],
  ["San Jose", 37.3382, -121.8863, "California"],
  ["St. Louis", 38.6270, -90.1994, "Missouri"],
  ["Tampa", 27.9506, -82.4572, "Florida"],
  ["Tucson", 32.2226, -110.9747, "Arizona"],
  ["Washington DC", 38.9072, -77.0369, "DC"],
  ["Austin", 30.2672, -97.7431, "Texas"],
  ["Albuquerque", 35.0844, -106.6504, "New Mexico"],
];
centuryPops.forEach(([city, lat, lng, region]) => {
  add("CenturyLink", `CenturyLink ${city}`, "205.171.3.65", "dns", lat, lng, "US", city, region);
});

// Spectrum/Charter US PoPs
const spectrumPops = [
  ["New York", 40.7128, -74.0060, "New York"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Orlando", 28.5383, -81.3792, "Florida"],
  ["Charlotte", 35.2271, -80.8431, "North Carolina"],
  ["Columbus", 39.9612, -82.9988, "Ohio"],
  ["Kansas City", 39.0997, -94.5786, "Missouri"],
  ["Milwaukee", 43.0389, -87.9065, "Wisconsin"],
  ["San Antonio", 29.4241, -98.4936, "Texas"],
  ["Tampa", 27.9506, -82.4572, "Florida"],
  ["Raleigh", 35.7796, -78.6382, "North Carolina"],
  ["Louisville", 38.2527, -85.7585, "Kentucky"],
  ["Birmingham", 33.5207, -86.8025, "Alabama"],
  ["Greenville", 34.8526, -82.3940, "South Carolina"],
];
spectrumPops.forEach(([city, lat, lng, region]) => {
  add("Spectrum", `Spectrum ${city}`, "209.18.47.61", "dns", lat, lng, "US", city, region);
});

// Comcast/Xfinity US PoPs
const comcastPops = [
  ["Philadelphia", 39.9526, -75.1652, "Pennsylvania"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Houston", 29.7604, -95.3698, "Texas"],
  ["Jacksonville", 30.3322, -81.6557, "Florida"],
  ["Minneapolis", 44.9778, -93.2650, "Minnesota"],
  ["Nashville", 36.1627, -86.7816, "Tennessee"],
  ["Portland", 45.5152, -122.6784, "Oregon"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Washington DC", 38.9072, -77.0369, "DC"],
  ["Detroit", 42.3314, -83.0458, "Michigan"],
  ["Boston", 42.3601, -71.0589, "Massachusetts"],
  ["Miami", 25.7617, -80.1918, "Florida"],
];
comcastPops.forEach(([city, lat, lng, region]) => {
  add("Comcast", `Comcast ${city}`, "75.75.75.75", "dns", lat, lng, "US", city, region);
});

// Cox Communications
const coxPops = [
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Las Vegas", 36.1699, -115.1398, "Nevada"],
  ["Oklahoma City", 35.4676, -97.5164, "Oklahoma"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
  ["San Diego", 32.7157, -117.1611, "California"],
  ["Norfolk", 36.8508, -76.2859, "Virginia"],
  ["Cleveland", 41.4993, -81.6944, "Ohio"],
  ["Omaha", 41.2565, -95.9345, "Nebraska"],
  ["Wichita", 37.6872, -97.3301, "Kansas"],
  ["Tulsa", 36.1540, -95.9928, "Oklahoma"],
];
coxPops.forEach(([city, lat, lng, region]) => {
  add("Cox", `Cox ${city}`, "68.105.28.11", "dns", lat, lng, "US", city, region);
});

// AT&T US PoPs
const attPops = [
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["Detroit", 42.3314, -83.0458, "Michigan"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Houston", 29.7604, -95.3698, "Texas"],
  ["Washington DC", 38.9072, -77.0369, "DC"],
  ["Philadelphia", 39.9526, -75.1652, "Pennsylvania"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
  ["Minneapolis", 44.9778, -93.2650, "Minnesota"],
];
attPops.forEach(([city, lat, lng, region]) => {
  add("AT&T", `AT&T ${city}`, "68.94.156.1", "dns", lat, lng, "US", city, region);
});

// Verizon US PoPs
const verizonPops = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["Boston", 42.3601, -71.0589, "Massachusetts"],
  ["Houston", 29.7604, -95.3698, "Texas"],
  ["Philadelphia", 39.9526, -75.1652, "Pennsylvania"],
  ["Minneapolis", 44.9778, -93.2650, "Minnesota"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
];
verizonPops.forEach(([city, lat, lng, region]) => {
  add("Verizon", `Verizon ${city}`, "4.35.238.193", "dns", lat, lng, "US", city, region);
});

// T-Mobile US PoPs
const tmobilePops = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["New York", 40.7128, -74.0060, "New York"],
];
tmobilePops.forEach(([city, lat, lng, region]) => {
  add("T-Mobile", `T-Mobile ${city}`, "76.14.0.8", "dns", lat, lng, "US", city, region);
});

// Windscribe
add("Windscribe", "Windscribe DoH", "163.172.180.125", "doh", 40.7128, -74.0060, "US", "New York", "New York", "https://dns.windscribe.com/dns-query");

// Wikimedia DNS
add("Wikimedia", "Wikimedia DNS DoH", "185.71.138.138", "doh", 37.7749, -122.4194, "US", "San Francisco", "California", "https://wikimedia-dns.org/dns-query");

// AhaDNS
add("AhaDNS", "AhaDNS NL", "5.2.75.75", "dns", 52.3676, 4.9041, "NL", "Amsterdam", "North Holland");
add("AhaDNS", "AhaDNS AU", "103.73.64.132", "dns", -33.8688, 151.2093, "AU", "Sydney", "NSW");
add("AhaDNS", "AhaDNS DoH NL", "5.2.75.75", "doh", 52.3676, 4.9041, "NL", "Amsterdam", "North Holland", "https://doh.nl.ahadns.net/dns-query");

// Restena (Luxembourg)
add("Restena", "Restena DNS", "158.64.1.29", "dns", 49.6116, 6.1319, "LU", "Luxembourg City", "Luxembourg");

// NTT (Japan)
add("NTT", "NTT DNS", "129.250.35.250", "dns", 35.6762, 139.6503, "JP", "Tokyo", "Kanto");

// KDDI (Japan)
add("KDDI", "KDDI DNS", "111.171.248.1", "dns", 35.6762, 139.6503, "JP", "Tokyo", "Kanto");

// SoftBank (Japan)
add("SoftBank", "SoftBank DNS", "202.172.28.1", "dns", 35.6762, 139.6503, "JP", "Tokyo", "Kanto");

// Chunghwa Telecom (Taiwan)
add("Chunghwa", "Chunghwa DNS", "168.95.192.1", "dns", 25.0330, 121.5654, "TW", "Taipei", "Taiwan");
add("Chunghwa", "Chunghwa DNS 2", "168.95.1.1", "dns", 25.0330, 121.5654, "TW", "Taipei", "Taiwan");

// Rogers (Canada)
add("Rogers", "Rogers DNS", "64.71.255.198", "dns", 43.6532, -79.3832, "CA", "Toronto", "Ontario");

// Bell (Canada)
add("Bell", "Bell DNS", "198.235.216.110", "dns", 45.5017, -73.5673, "CA", "Montreal", "Quebec");

// Shaw/Freedom (Canada)
add("Shaw", "Shaw DNS", "64.59.144.17", "dns", 51.0447, -114.0719, "CA", "Calgary", "Alberta");

// Telus (Canada)
add("Telus", "Telus DNS", "154.11.1.1", "dns", 49.2827, -123.1207, "CA", "Vancouver", "BC");

// ─── Additional US ISP Regional PoPs ─────────────────────────────────────────

// Frontier Communications
const frontierPops = [
  ["Rochester", 43.1566, -77.6088, "New York"],
  ["Tampa", 27.9506, -82.4572, "Florida"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Portland", 45.5152, -122.6784, "Oregon"],
  ["Hartford", 41.7658, -72.6734, "Connecticut"],
  ["Indianapolis", 39.7684, -86.1581, "Indiana"],
  ["Milwaukee", 43.0389, -87.9065, "Wisconsin"],
  ["Salt Lake City", 40.7608, -111.8910, "Utah"],
  ["Tucson", 32.2226, -110.9747, "Arizona"],
];
frontierPops.forEach(([city, lat, lng, region]) => {
  add("Frontier", `Frontier ${city}`, "74.40.74.40", "dns", lat, lng, "US", city, region);
});

// Windstream
const windstreamPops = [
  ["Little Rock", 34.7465, -92.2896, "Arkansas"],
  ["Charlotte", 35.2271, -80.8431, "North Carolina"],
  ["Lexington", 38.0406, -84.5037, "Kentucky"],
  ["Lincoln", 40.8136, -96.7026, "Nebraska"],
  ["Des Moines", 41.5868, -93.6250, "Iowa"],
  ["Buffalo", 42.8864, -78.8784, "New York"],
  ["Raleigh", 35.7796, -78.6382, "North Carolina"],
  ["Columbus", 39.9612, -82.9988, "Ohio"],
  ["Knoxville", 35.9606, -83.9207, "Tennessee"],
  ["Baton Rouge", 30.4515, -91.1871, "Louisiana"],
];
windstreamPops.forEach(([city, lat, lng, region]) => {
  add("Windstream", `Windstream ${city}`, "167.206.8.2", "dns", lat, lng, "US", city, region);
});

// Mediacom
const mediacomPops = [
  ["Des Moines", 41.5868, -93.6250, "Iowa"],
  ["Springfield", 37.2090, -93.2923, "Missouri"],
  ["Macon", 32.8407, -83.6324, "Georgia"],
  ["Cedar Rapids", 41.9779, -91.6656, "Iowa"],
  ["Terre Haute", 39.4667, -87.4139, "Indiana"],
];
mediacomPops.forEach(([city, lat, lng, region]) => {
  add("Mediacom", `Mediacom ${city}`, "24.217.0.5", "dns", lat, lng, "US", city, region);
});

// WOW (WideOpenWest)
const wowPops = [
  ["Detroit", 42.3314, -83.0458, "Michigan"],
  ["Cleveland", 41.4993, -81.6944, "Ohio"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Columbus", 39.9612, -82.9988, "Ohio"],
  ["Knoxville", 35.9606, -83.9207, "Tennessee"],
  ["Montgomery", 32.3668, -86.3000, "Alabama"],
  ["Augusta", 33.4735, -82.0105, "Georgia"],
  ["Huntsville", 34.7304, -86.5861, "Alabama"],
];
wowPops.forEach(([city, lat, lng, region]) => {
  add("WOW", `WOW ${city}`, "75.75.75.75", "dns", lat, lng, "US", city, region);
});

// Consolidated Communications
const consolidatedPops = [
  ["Mattoon", 39.4831, -88.3723, "Illinois"],
  ["Sacramento", 38.5816, -121.4944, "California"],
  ["Portland", 45.5152, -122.6784, "Oregon"],
  ["Bangor", 44.8016, -68.7712, "Maine"],
  ["Concord", 43.2081, -71.5376, "New Hampshire"],
  ["Burlington", 44.4759, -73.2121, "Vermont"],
];
consolidatedPops.forEach(([city, lat, lng, region]) => {
  add("Consolidated", `Consolidated ${city}`, "205.152.37.23", "dns", lat, lng, "US", city, region);
});

// TDS Telecom
const tdsPops = [
  ["Madison", 43.0731, -89.4012, "Wisconsin"],
  ["Knoxville", 35.9606, -83.9207, "Tennessee"],
  ["Albuquerque", 35.0844, -106.6504, "New Mexico"],
  ["Boise", 43.6150, -116.2023, "Idaho"],
  ["Bend", 44.0582, -121.3153, "Oregon"],
];
tdsPops.forEach(([city, lat, lng, region]) => {
  add("TDS", `TDS ${city}`, "208.179.100.19", "dns", lat, lng, "US", city, region);
});

// US Cellular
const uscellularPops = [
  ["Des Moines", 41.5868, -93.6250, "Iowa"],
  ["Knoxville", 35.9606, -83.9207, "Tennessee"],
  ["Milwaukee", 43.0389, -87.9065, "Wisconsin"],
  ["Portland", 45.5152, -122.6784, "Oregon"],
  ["Tulsa", 36.1540, -95.9928, "Oklahoma"],
  ["Oklahoma City", 35.4676, -97.5164, "Oklahoma"],
  ["Lincoln", 40.8136, -96.7026, "Nebraska"],
  ["Columbia", 38.9517, -92.3341, "Missouri"],
];
uscellularPops.forEach(([city, lat, lng, region]) => {
  add("US Cellular", `US Cellular ${city}`, "66.23.225.12", "dns", lat, lng, "US", city, region);
});

// Google DoH additional PoPs
const googleDohPoPs = [
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Minneapolis", 44.9778, -93.2650, "Minnesota"],
];
googleDohPoPs.forEach(([city, lat, lng, region]) => {
  add("Google", `Google DoH ${city}`, "8.8.8.8", "doh", lat, lng, "US", city, region, "https://dns.google/dns-query");
});

// Cloudflare Malware Blocking (1.1.1.2)
const cfMalware = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
  ["Boston", 42.3601, -71.0589, "Massachusetts"],
];
cfMalware.forEach(([city, lat, lng, region]) => {
  add("Cloudflare", `CF Malware ${city}`, "1.1.1.2", "dns", lat, lng, "US", city, region);
});

// Cloudflare Family (1.1.1.3)
const cfFamily = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
  ["Boston", 42.3601, -71.0589, "Massachusetts"],
];
cfFamily.forEach(([city, lat, lng, region]) => {
  add("Cloudflare", `CF Family ${city}`, "1.1.1.3", "dns", lat, lng, "US", city, region);
});

// Quad9 DoH additional PoPs
const quad9DohPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
];
quad9DohPoPs.forEach(([city, lat, lng, region]) => {
  add("Quad9", `Quad9 DoH ${city}`, "9.9.9.9", "doh", lat, lng, "US", city, region, "https://dns.quad9.net/dns-query");
});

// Cloudflare International PoPs
const cfIntl = [
  ["London", 51.5074, -0.1278, "England", "GB"],
  ["Frankfurt", 50.1109, 8.6821, "Hesse", "DE"],
  ["Amsterdam", 52.3676, 4.9041, "North Holland", "NL"],
  ["Paris", 48.8566, 2.3522, "Île-de-France", "FR"],
  ["Tokyo", 35.6762, 139.6503, "Kanto", "JP"],
  ["Singapore", 1.3521, 103.8198, "Singapore", "SG"],
  ["Sydney", -33.8688, 151.2093, "NSW", "AU"],
  ["São Paulo", -23.5505, -46.6333, "São Paulo", "BR"],
  ["Mumbai", 19.0760, 72.8777, "Maharashtra", "IN"],
  ["Toronto", 43.6532, -79.3832, "Ontario", "CA"],
  ["Seoul", 37.5665, 126.9780, "Seoul", "KR"],
  ["Hong Kong", 22.3193, 114.1694, "Hong Kong", "HK"],
  ["Dubai", 25.2048, 55.2708, "Dubai", "AE"],
  ["Johannesburg", -26.2041, 28.0473, "Gauteng", "ZA"],
  ["Stockholm", 59.3293, 18.0686, "Stockholm", "SE"],
  ["Warsaw", 52.2297, 21.0122, "Masovia", "PL"],
  ["Madrid", 40.4168, -3.7038, "Madrid", "ES"],
  ["Milan", 45.4642, 9.1900, "Lombardy", "IT"],
  ["Zurich", 47.3769, 8.5417, "Zurich", "CH"],
  ["Vienna", 48.2082, 16.3738, "Vienna", "AT"],
  ["Dublin", 53.3498, -6.2603, "Leinster", "IE"],
  ["Helsinki", 60.1699, 24.9384, "Uusimaa", "FI"],
  ["Oslo", 59.9139, 10.7522, "Oslo", "NO"],
  ["Copenhagen", 55.6761, 12.5683, "Capital Region", "DK"],
  ["Lisbon", 38.7223, -9.1393, "Lisbon", "PT"],
  ["Athens", 37.9838, 23.7275, "Attica", "GR"],
  ["Istanbul", 41.0082, 28.9784, "Marmara", "TR"],
  ["Mexico City", 19.4326, -99.1332, "CDMX", "MX"],
  ["Buenos Aires", -34.6037, -58.3816, "Buenos Aires", "AR"],
  ["Santiago", -33.4489, -70.6693, "Santiago", "CL"],
  ["Lima", -12.0464, -77.0428, "Lima", "PE"],
  ["Bogotá", 4.7110, -74.0721, "Cundinamarca", "CO"],
  ["Nairobi", -1.2921, 36.8219, "Nairobi", "KE"],
  ["Lagos", 6.5244, 3.3792, "Lagos", "NG"],
  ["Cairo", 30.0444, 31.2357, "Cairo", "EG"],
  ["Bangkok", 13.7563, 100.5018, "Bangkok", "TH"],
  ["Jakarta", -6.2088, 106.8456, "Jakarta", "ID"],
  ["Kuala Lumpur", 3.1390, 101.6869, "KL", "MY"],
  ["Taipei", 25.0330, 121.5654, "Taiwan", "TW"],
  ["Osaka", 34.6937, 135.5023, "Kansai", "JP"],
  ["Manila", 14.5995, 120.9842, "NCR", "PH"],
  ["Auckland", -36.8485, 174.7633, "Auckland", "NZ"],
  ["Perth", -31.9505, 115.8605, "WA", "AU"],
  ["Melbourne", -37.8136, 144.9631, "VIC", "AU"],
  ["Vancouver", 49.2827, -123.1207, "BC", "CA"],
  ["Montreal", 45.5017, -73.5673, "Quebec", "CA"],
];
cfIntl.forEach(([city, lat, lng, region, country]) => {
  add("Cloudflare", `CF ${city}`, "1.1.1.1", "dns", lat, lng, country, city, region);
});

// Google International PoPs
const googleIntl = [
  ["London", 51.5074, -0.1278, "England", "GB"],
  ["Frankfurt", 50.1109, 8.6821, "Hesse", "DE"],
  ["Amsterdam", 52.3676, 4.9041, "North Holland", "NL"],
  ["Tokyo", 35.6762, 139.6503, "Kanto", "JP"],
  ["Singapore", 1.3521, 103.8198, "Singapore", "SG"],
  ["Sydney", -33.8688, 151.2093, "NSW", "AU"],
  ["São Paulo", -23.5505, -46.6333, "São Paulo", "BR"],
  ["Mumbai", 19.0760, 72.8777, "Maharashtra", "IN"],
  ["Toronto", 43.6532, -79.3832, "Ontario", "CA"],
  ["Seoul", 37.5665, 126.9780, "Seoul", "KR"],
  ["Hong Kong", 22.3193, 114.1694, "Hong Kong", "HK"],
  ["Taipei", 25.0330, 121.5654, "Taiwan", "TW"],
  ["Zurich", 47.3769, 8.5417, "Zurich", "CH"],
  ["Warsaw", 52.2297, 21.0122, "Masovia", "PL"],
  ["Osaka", 34.6937, 135.5023, "Kansai", "JP"],
];
googleIntl.forEach(([city, lat, lng, region, country]) => {
  add("Google", `Google DNS ${city}`, "8.8.8.8", "dns", lat, lng, country, city, region);
});

// ─── More US Regional & Educational DNS ──────────────────────────────────────

// OpenDNS DoH additional PoPs
const opendnsDohPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
];
opendnsDohPoPs.forEach(([city, lat, lng, region]) => {
  add("OpenDNS", `OpenDNS DoH ${city}`, "208.67.222.222", "doh", lat, lng, "US", city, region, "https://doh.opendns.com/dns-query");
});

// Mullvad DoH additional PoPs
const mullvadDohPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
];
mullvadDohPoPs.forEach(([city, lat, lng, region]) => {
  add("Mullvad", `Mullvad DoH ${city}`, "194.242.2.2", "doh", lat, lng, "US", city, region, "https://dns.mullvad.net/dns-query");
});

// NextDNS DoH additional PoPs
const nextdnsDohPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
];
nextdnsDohPoPs.forEach(([city, lat, lng, region]) => {
  add("NextDNS", `NextDNS DoH ${city}`, "45.90.28.0", "doh", lat, lng, "US", city, region, "https://dns.nextdns.io/dns-query");
});

// ControlD DoH additional PoPs
const controldDohPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
];
controldDohPoPs.forEach(([city, lat, lng, region]) => {
  add("ControlD", `ControlD DoH ${city}`, "76.76.2.0", "doh", lat, lng, "US", city, region, "https://freedns.controld.com/p0");
});

// RethinkDNS DoH additional PoPs
const rethinkDohPoPs = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["San Francisco", 37.7749, -122.4194, "California"],
];
rethinkDohPoPs.forEach(([city, lat, lng, region]) => {
  add("RethinkDNS", `RethinkDNS DoH ${city}`, "76.76.19.19", "doh", lat, lng, "US", city, region, "https://basic.rethinkdns.com/dns-query");
});

// Quad9 International PoPs
const quad9Intl = [
  ["London", 51.5074, -0.1278, "England", "GB"],
  ["Frankfurt", 50.1109, 8.6821, "Hesse", "DE"],
  ["Amsterdam", 52.3676, 4.9041, "North Holland", "NL"],
  ["Paris", 48.8566, 2.3522, "Île-de-France", "FR"],
  ["Tokyo", 35.6762, 139.6503, "Kanto", "JP"],
  ["Singapore", 1.3521, 103.8198, "Singapore", "SG"],
  ["Sydney", -33.8688, 151.2093, "NSW", "AU"],
  ["São Paulo", -23.5505, -46.6333, "São Paulo", "BR"],
  ["Toronto", 43.6532, -79.3832, "Ontario", "CA"],
  ["Hong Kong", 22.3193, 114.1694, "Hong Kong", "HK"],
  ["Mumbai", 19.0760, 72.8777, "Maharashtra", "IN"],
  ["Zurich", 47.3769, 8.5417, "Zurich", "CH"],
  ["Vienna", 48.2082, 16.3738, "Vienna", "AT"],
  ["Warsaw", 52.2297, 21.0122, "Masovia", "PL"],
  ["Stockholm", 59.3293, 18.0686, "Stockholm", "SE"],
  ["Dubai", 25.2048, 55.2708, "Dubai", "AE"],
  ["Seoul", 37.5665, 126.9780, "Seoul", "KR"],
  ["Osaka", 34.6937, 135.5023, "Kansai", "JP"],
  ["Johannesburg", -26.2041, 28.0473, "Gauteng", "ZA"],
  ["Nairobi", -1.2921, 36.8219, "Nairobi", "KE"],
];
quad9Intl.forEach(([city, lat, lng, region, country]) => {
  add("Quad9", `Quad9 ${city}`, "9.9.9.9", "dns", lat, lng, country, city, region);
});

// OpenDNS International
const opendnsIntl = [
  ["London", 51.5074, -0.1278, "England", "GB"],
  ["Frankfurt", 50.1109, 8.6821, "Hesse", "DE"],
  ["Amsterdam", 52.3676, 4.9041, "North Holland", "NL"],
  ["Tokyo", 35.6762, 139.6503, "Kanto", "JP"],
  ["Singapore", 1.3521, 103.8198, "Singapore", "SG"],
  ["Sydney", -33.8688, 151.2093, "NSW", "AU"],
  ["São Paulo", -23.5505, -46.6333, "São Paulo", "BR"],
  ["Toronto", 43.6532, -79.3832, "Ontario", "CA"],
  ["Hong Kong", 22.3193, 114.1694, "Hong Kong", "HK"],
  ["Paris", 48.8566, 2.3522, "Île-de-France", "FR"],
];
opendnsIntl.forEach(([city, lat, lng, region, country]) => {
  add("OpenDNS", `OpenDNS ${city}`, "208.67.222.222", "dns", lat, lng, country, city, region);
});

// AdGuard International PoPs
const adguardIntl = [
  ["London", 51.5074, -0.1278, "England", "GB"],
  ["Frankfurt", 50.1109, 8.6821, "Hesse", "DE"],
  ["Amsterdam", 52.3676, 4.9041, "North Holland", "NL"],
  ["Tokyo", 35.6762, 139.6503, "Kanto", "JP"],
  ["Singapore", 1.3521, 103.8198, "Singapore", "SG"],
  ["New York", 40.7128, -74.0060, "New York", "US"],
  ["Los Angeles", 34.0522, -118.2437, "California", "US"],
  ["Chicago", 41.8781, -87.6298, "Illinois", "US"],
  ["Dallas", 32.7767, -96.7970, "Texas", "US"],
  ["Seattle", 47.6062, -122.3321, "Washington", "US"],
  ["Miami", 25.7617, -80.1918, "Florida", "US"],
  ["Ashburn", 39.0438, -77.4874, "Virginia", "US"],
  ["São Paulo", -23.5505, -46.6333, "São Paulo", "BR"],
  ["Sydney", -33.8688, 151.2093, "NSW", "AU"],
  ["Mumbai", 19.0760, 72.8777, "Maharashtra", "IN"],
];
adguardIntl.forEach(([city, lat, lng, region, country]) => {
  add("AdGuard", `AdGuard ${city}`, "94.140.14.14", "dns", lat, lng, country, city, region);
});

// ─── Fill to 800+ ─────────────────────────────────────────────────────────────

// Cloudflare 1.0.0.1 secondary US PoPs
const cf2US = [
  ["Ashburn", 39.0438, -77.4874, "Virginia"],
  ["Atlanta", 33.7490, -84.3880, "Georgia"],
  ["Chicago", 41.8781, -87.6298, "Illinois"],
  ["Dallas", 32.7767, -96.7970, "Texas"],
  ["Denver", 39.7392, -104.9903, "Colorado"],
  ["Houston", 29.7604, -95.3698, "Texas"],
  ["Los Angeles", 34.0522, -118.2437, "California"],
  ["Miami", 25.7617, -80.1918, "Florida"],
  ["Minneapolis", 44.9778, -93.2650, "Minnesota"],
  ["New York", 40.7128, -74.0060, "New York"],
  ["Phoenix", 33.4484, -112.0740, "Arizona"],
  ["San Francisco", 37.7749, -122.4194, "California"],
  ["Seattle", 47.6062, -122.3321, "Washington"],
  ["Portland", 45.5152, -122.6784, "Oregon"],
  ["Boston", 42.3601, -71.0589, "Massachusetts"],
  ["Nashville", 36.1627, -86.7816, "Tennessee"],
  ["Philadelphia", 39.9526, -75.1652, "Pennsylvania"],
  ["Salt Lake City", 40.7608, -111.8910, "Utah"],
  ["San Jose", 37.3382, -121.8863, "California"],
  ["Washington DC", 38.9072, -77.0369, "DC"],
];
cf2US.forEach(([city, lat, lng, region]) => {
  add("Cloudflare", `CF Secondary ${city}`, "1.0.0.1", "dns", lat, lng, "US", city, region);
});

// Google DNS Secondary International
const google2Intl = [
  ["London", 51.5074, -0.1278, "England", "GB"],
  ["Frankfurt", 50.1109, 8.6821, "Hesse", "DE"],
  ["Tokyo", 35.6762, 139.6503, "Kanto", "JP"],
  ["Singapore", 1.3521, 103.8198, "Singapore", "SG"],
  ["Sydney", -33.8688, 151.2093, "NSW", "AU"],
  ["São Paulo", -23.5505, -46.6333, "São Paulo", "BR"],
  ["Toronto", 43.6532, -79.3832, "Ontario", "CA"],
  ["Seoul", 37.5665, 126.9780, "Seoul", "KR"],
  ["Mumbai", 19.0760, 72.8777, "Maharashtra", "IN"],
  ["Amsterdam", 52.3676, 4.9041, "North Holland", "NL"],
  ["Hong Kong", 22.3193, 114.1694, "Hong Kong", "HK"],
  ["Osaka", 34.6937, 135.5023, "Kansai", "JP"],
  ["Zurich", 47.3769, 8.5417, "Zurich", "CH"],
  ["Warsaw", 52.2297, 21.0122, "Masovia", "PL"],
  ["Stockholm", 59.3293, 18.0686, "Stockholm", "SE"],
  ["Paris", 48.8566, 2.3522, "Île-de-France", "FR"],
  ["Dubai", 25.2048, 55.2708, "Dubai", "AE"],
  ["Mexico City", 19.4326, -99.1332, "CDMX", "MX"],
  ["Buenos Aires", -34.6037, -58.3816, "Buenos Aires", "AR"],
  ["Taipei", 25.0330, 121.5654, "Taiwan", "TW"],
];
google2Intl.forEach(([city, lat, lng, region, country]) => {
  add("Google", `Google DNS2 ${city}`, "8.8.4.4", "dns", lat, lng, country, city, region);
});

module.exports = resolvers;
