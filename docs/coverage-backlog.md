# Framework coverage backlog — no-list CCS/RM frameworks (audit 2026-06-13)

Produced by the `framework-coverage-audit` workflow (40 agents) — every live CCS/RM framework with no
appointed-supplier list, classified against its official source. Counts: fillable_public=9, fillable_digital_marketplace=1, duplicate_already_covered=3, dps_rolling_not_exposed=13, login_walled=8, dynamic_no_public_list=5.

## Fillable — public supplier list at the official source (ACTION) (9)
- **RM1043.9** Digital Outcomes and Specialists 7 — Public supplier list deterministically fillable from GCA-hosted ODS file containing 1,807 appointed suppliers across Lot 1 (Digital Outcomes). Sibling RM1043.8 (DOS6, expired 27 Jun 2026) does not hav
  - source: https://assets.gca.gov.uk/wp-content/uploads/RM1043.9-DOS-7-UK6-Notices-awarded-supplier-and-tenders-list-–-not-to-be-us
- **RM1043.9** Digital Outcomes and Specialists 7 (DOS7) — Framework description states: "You must publish your requirements on CAS... All suppliers awarded a place on the agreement, and registered on the platform, will be able to view and respond to your req
  - source: https://www.gca.gov.uk/agreements/RM1043.9
- **RM3764.3** Cyber Security Services 3 — Public supplier list confirmed accessible (HTTP 200). Legacy DPS (Dynamic Purchasing System) operated by GCA. Suppliers page displays 508 suppliers on agreement, each with framework references. No sib
  - source: https://www.gca.gov.uk/agreements/RM3764.3/suppliers
- **RM6235** Space-Enabled and Geospatial Services — DPS framework with 222 appointed suppliers publicly listed on the Cabinet Office Supplier Registration Service. No sibling/duplicate RM6235 found. Official public suppliers page found at supplierregis
  - source: https://supplierregistration.cabinetoffice.gov.uk/dps-suppliers/RM6235
- **RM6242** Construction Professional Services DPS — The official GCA and CCS URLs return 403 Forbidden, but the supplier list is publicly accessible via the Cabinet Office Supplier Registration Service portal without authentication. 417 total appointed
  - source: https://supplierregistration.cabinetoffice.gov.uk/dps-suppliers/RM6242
- **RM6309** Management Consultancy Framework Four (MCF4) — Public supplier lists available on GCA website for all 10 lots. Lot 7 (Health, social care and community) has 46 suppliers publicly listed and accessible. Framework operator: miaa (NHS SBS), type: clo
  - source: https://www.gca.gov.uk/agreements/RM6309:7/lot-suppliers
- **RM6333** International Healthcare Professional Recruitment and Associated Servi — Official framework page at https://www.eoecph.nhs.uk/frameworks/international-recruitment-of-clinical-healthcare-professionals/ links to NHS Workforce Alliance (https://www.workforcealliance.nhs.uk/fr
  - source: https://www.workforcealliance.nhs.uk/suppliers/?framework=international-recruitment
- **RM6350** Income Generation from Estates, Assets & IP DPS — RM6350 is a DPS with 13 publicly listed appointed suppliers accessible from the Cabinet Office Supplier Registration Service. Sibling RM6349 has separate supplier list (10 suppliers) - not duplicates.
  - source: https://supplierregistration.cabinetoffice.gov.uk/dps-suppliers/RM6350
- **RM6361_25** Multifunctional Devices, GovPrint Hardware, Managed Print Provision an — RM6361_25 is operated by ESPO as a duplicate/sibling of YPO's RM6361. The official YPO framework page (https://www.ypo.co.uk/frameworks-home/900609) publicly lists appointed suppliers across 5 lots: L
  - source: https://www.ypo.co.uk/frameworks-home/900609

## Fillable — Digital Marketplace (already ingested via G-Cloud spine) (1)
- **RM1557.14** G-Cloud 14 Framework — G-Cloud 14 (RM1557.14) is live until 28 October 2026. The appointed supplier list is publicly browsable on the Digital Marketplace applytosupply.digitalmarketplace.service.gov.uk/g-cloud/suppliers pag
  - source: https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/suppliers

## Already covered (a sibling instrument carries the list) (3)
- **RM1043.8** Digital Outcomes 6 — Digital Outcomes 6 (RM1043.8) ended 27 June 2026 and has been consolidated into Digital Outcomes and Specialists 7 (RM1043.9/DOS7) which went live 1 April 2026. The official GCA page explicitly states
  - source: https://www.gca.gov.uk/agreements/RM1043.8
- **RM4** Refurbishment and Modernisation (RM4) — RM4 is marked as "Upcoming Framework" on the official SPA page and has not yet been awarded, so it has zero appointed suppliers currently. However, its predecessor RM3 (Refurbishment and Modernisation
  - source: https://www.scottishprocurement.scot/all-frameworks/refurbishment-modernisation-rm3/
- **RM6313** Demand Management & Renewables DPS — Sibling instrument RM6314 (Demand Management & Renewables Framework Agreement) carries a publicly accessible supplier list with 39 suppliers. RM6313 shows 0 suppliers on https://www.gca.gov.uk/agreeme
  - source: https://www.gca.gov.uk/agreements/RM6314/suppliers

## DPS / dynamic market — rolling membership NOT published (structural) (13)
- **RM6102** Apprenticeship Training Dynamic Marketplace — DPS framework with rolling membership. Suppliers are NOT publicly listed on GCA website. Supplier prospectus and contact information are only accessible to registered buyers who log into the supplier 
  - source: https://www.gca.gov.uk/agreements/RM6102
- **RM6126** Research & Insights — This is a legacy Dynamic Purchasing System (DPS) with open/rolling membership. Suppliers can apply to join at any time throughout the agreement's life (expires 23 Feb 2029), making the membership non-
  - source: https://www.gca.gov.uk/agreements/RM6126
- **RM6148** Quality Assurance and Testing for IT Systems 2 — Legacy DPS under PCR2015 (expires 23 Feb 2029). Supplier list is dynamically maintained in the DPS Marketplace portal and is NOT publicly published. Buyers must register on the Marketplace to view app
- **RM6173** Automation Marketplace DPS — DPS with rolling membership where suppliers can join at any time. Supplier list is only accessible to authenticated buyers through the gated supplierregistration.cabinetoffice.gov.uk portal. No static
  - source: https://www.gca.gov.uk/agreements/RM6173
- **RM6213** Vehicle Charging Infrastructure Solutions (VCIS) — Legacy DPS with rolling/dynamic supplier membership. No public supplier list; access restricted to registered buyers via login-walled portal at https://supplierregistration.cabinetoffice.gov.uk/dps. P
  - source: https://www.gca.gov.uk/agreements/RM6213
- **RM6219** NHS Workforce Alliance Learning and Training Services Dynamic Purchasi — Dynamic Purchasing System with open, rolling supplier membership managed by NOE CPC. Official page (https://www.noecpc.nhs.uk/contracts/learning-and-training-services-dynamic-purchasing-system) descri
- **RM6219** Learning and Training Services Dynamic Purchasing System — Legacy DPS operated by NHS Workforce Alliance, not GCA. Designated as a Dynamic Purchasing System (legacy PCR2015 mechanism), meaning it maintains a rolling/dynamic supplier list that is not published
  - source: https://www.gca.gov.uk/agreements/RM6219
- **RM6237** Low Value Purchase System — Legacy DPS (PCR2015). Official page (https://www.gca.gov.uk/agreements/RM6237) returns 403 Forbidden. Domain research (2026-06-06) explicitly documents GCA DPS frameworks as having "DPS lists via auth
- **RM6241** Housing Maintenance and Repair — GCA legacy DPS (dynamic purchasing system). Official agreement URL (https://www.gca.gov.uk/agreements/RM6241) returns HTTP 403 Forbidden to automated requests. GCA's documented approach for DPS/dynami
  - source: https://www.gca.gov.uk/agreements/RM6241
- **RM6264** Facilities Management and Workplace Services DPS — Legacy DPS under PCR2015 regime. GCA's documented pattern: DPS/dynamic market membership rolls permanently and is NOT exposed by the GCA suppliers API or framework pages. Official URL (https://www.gca
- **RM6296** Occupational Health and Related Services DPS — GCA (formerly CCS, renamed 1 April 2026) operates this legacy Dynamic Purchasing System. Official URL (https://www.gca.gov.uk/agreements/RM6296) returns 403 Forbidden. Not present in govbuy ingestion 
- **RM6301** Open Banking (Data, Digital Payments & Confirmation of Payee Services) — Legacy DPS (legacy_dps) framework administered by GCA. DPS frameworks by definition feature rolling supplier membership managed by the agency — suppliers are not published as a static list. The offici
- **RM6322** Fund Administration & Disbursement Services DPS (FAADS) — Official GCA page returns 403 Forbidden; GCA API (gca.gov.uk/api/suppliers) also unreachable via automated access. RM6322 is a legacy DPS operated by CCS/GCA with rolling membership. No public supplie
  - source: https://www.gca.gov.uk/agreements/RM6322

## Login-walled — needs portal credentials (8)
- **RM3825** HSCN DPS — Legacy DPS (PCR2015). Supplier list accessible only via login-restricted portal (https://supplierregistration.cabinetoffice.gov.uk/login). RM3825 not in GCA public supplier search. No public data expo
  - source: https://www.gca.gov.uk/agreements/RM3825
- **RM6094** Spark DPS — Dynamic Purchasing System with rolling supplier membership. Suppliers can apply to join at any time (assessed within 15 working days). Appointed suppliers list is accessible only via login-required Su
  - source: https://www.gca.gov.uk/agreements/RM6094
- **RM6124** Communications Marketplace — RM6124 is a Dynamic Purchasing System (DPS) managed by GCA. The official GCA page (https://www.gca.gov.uk/agreements/RM6124) contains a link to "view appointed agencies" at https://supplierregistratio
  - source: https://www.gca.gov.uk/agreements/RM6124
- **RM6138** Insurance Services 3 DPS — Appointed supplier list only accessible through login portal at supplierregistration.cabinetoffice.gov.uk. Users must register as buyers, navigate to Insurance Services 3 DPS, accept customer access a
  - source: https://www.gca.gov.uk/agreements/RM6138
- **RM6200** Artificial Intelligence (AI) Dynamic Purchasing System — Official GCA page (https://www.gca.gov.uk/agreements/RM6200) loads successfully but supplier list is behind a login-walled portal. Buyers must register and authenticate in the DPS system to access the
- **RM6348** Adult Skills and Learning DPS — GCA DPS supplier lists are not publicly available. Research (govbuy domain map, 2026-06-06) confirms DPS lists are accessible only via authenticated buyer export. GCA public supplier search (gca.gov.u
  - source: https://www.gca.gov.uk/agreements/RM6348
- **RM6370** Space Technology Solutions — Dynamic market (DPS). GCA page shows 0 suppliers listed. SRS page explicitly requires buyer authentication ("Once you're ready to view suppliers, click 'Access as a buyer' below to login/register"). N
  - source: https://www.gca.gov.uk/agreements/RM6370 and https://supplierregistration.cabinetoffice.gov.uk/dm/RM6370
- **RM6380** Workforce Alliance: Health Workforce Solutions - RM6380 — Official NHS LPP page exists (https://www.lpp.nhs.uk/categories/hr-workforce/workforce-alliance/health-workforce-solutions-rm6380/) but all framework documentation and awarded supplier information is 

## Managing-agent / not-yet-awarded — no public list by design (5)
- **RM1043.7** Digital Outcomes and Specialists 5 — NECS (managing agent) lists RM1043.7 on their framework agreements page but only shows placeholder text "Supplier on Lot 1: Digital Outcomes" with no actual supplier names. GCA (operator) supplier pag
  - source: https://www.necsu.nhs.uk/our-story/framework-agreements/
- **RM4** Refurbishment and Modernisation (RM4) — RM4 is marked "Upcoming Framework" on the SPA website and is currently in the procurement phase with applications still open. No suppliers have been appointed yet, so there is no public appointed supp
  - source: https://www.scottishprocurement.scot/all-frameworks/refurbishment-and-modernisation-rm4/
- **RM6098_23** Technology Products & Associated Services 2 (TePAS 2) — Closed framework operated by ESPO. No official public URL on record. Multiple ESPO URL patterns attempted (espo.org/tepas-2, espo.org/technology-products, etc.) all return 404. Framework not indexed i
- **RM6310** Audit & Assurance Services Two (A&AS2) — Framework confirmed on official operator page (https://www.miaa.nhs.uk/about-us/frameworks/); 3 lots (Internal Audit, Counter-fraud, Other Assurance). Operator MIAA mentions being "an approved supplie
- **RM6397** Clinical and Non Clinical Temporary and Permanent Staff — Framework is upcoming (anticipated start date 28/02/2027) with no appointed suppliers yet. The page describes engagement models including managed service and neutral vendor options but does not publis
  - source: https://www.workforcealliance.nhs.uk/frameworks/clinical-and-non-clinical-temporary-and-permanent-staff/
