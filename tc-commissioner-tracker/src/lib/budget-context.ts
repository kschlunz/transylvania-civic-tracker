import budgetJson from "@/data/budget-fy26.json";
import type { BudgetData } from "@/lib/budget-types";

const budget = budgetJson as BudgetData;

export interface BudgetContextResult {
  department: string;
  fy26Total: number;
  percentChange: number;
  contextSentence: string;
  budgetUrl: string;
}

/** Keyword → department name mapping. Order matters — first match wins. */
const KEYWORD_MAP: [RegExp, string][] = [
  // Specific matches first
  [/\bEMS\b|ambulance|emergency medical|paramedic|emrgncy med/i, "Emrgncy Med. Srvcs."],
  [/\bK-12\b|public school|school fund|school budget|school construct|TCS\b/i, "K-12 Public School"],
  [/\bcommunity college/i, "Community Colleges"],
  [/\bdetention|jail\b|inmate/i, "Detention Center"],
  [/\bsheriff/i, "Sheriff"],
  [/\bnarcotics|drug task force/i, "Narcotics Task Force"],
  [/\bSRO\b|school resource officer/i, "Schl Resource Ofcrs"],
  [/\b911\b|dispatch|communications center/i, "911 Communications"],
  [/\banimal control|animal service/i, "Animal Services"],
  [/\bfire marshal/i, "Fire Marshal"],
  [/\bemergency management|disaster|hazard mitigation/i, "Emergency Management"],
  [/\blibrary/i, "Library Operations"],
  [/\bpark|recreation/i, "Parks & Recreation"],
  [/\btransportation|transit\b|bus\b/i, "Transportation Operati"],
  [/\belection|voting|ballot/i, "Elections"],
  [/\btax\b(?!.*TDA)|tax administration|revaluation/i, "Tax Administration"],
  [/\bregister of deeds/i, "Register of Deeds"],
  [/\bplanning|zoning|development review/i, "Planning & Development"],
  [/\binspection|code enforcement|building inspector/i, "Inspctions & Enfrcmnt"],
  [/\bsoil|water conservation/i, "Soil & Water Conservat"],
  [/\bcooperative extension|extension agent/i, "Cooperative Extension"],
  [/\bsocial services|DSS\b|child protective/i, "Dept. Social Services"],
  [/\bveteran/i, "Veterans Services"],
  [/\bhealth department|public health/i, "PH - Administration"],
  [/\benvironmental health|septic|well permit/i, "Environmental Health"],
  [/\bWIC\b/i, "WIC Operations"],
  [/\bdental/i, "County Dental Projects"],
  [/\bfacility|building maintenance|courthouse/i, "Facility Maintenance"],
  [/\bIT\b|information technology|software|cyber/i, "Information Technology"],
  [/\beconomic development/i, "Economic Development"],
  [/\btourism|TDA\b/i, "TDA Remittance"],
  [/\bcourt\b/i, "Court Services"],
  [/\bfinance\b|audit\b/i, "Finance"],
  [/\bhuman resources\b|HR\b/i, "Human Resources"],
];

/** Department data cache — built once on first call */
let deptCache: Map<string, { fy26Total: number; percentChange: number; context: string }> | null = null;

function buildDeptCache() {
  if (deptCache) return deptCache;
  deptCache = new Map();

  const contextByDept = new Map<string, string>();
  if (budget.notableChangesContext) {
    for (const c of budget.notableChangesContext) {
      // Keep the first (largest dollar change) context per department
      if (!contextByDept.has(c.department)) {
        contextByDept.set(c.department, c.context);
      }
    }
  }

  for (const dept of budget.departments) {
    deptCache.set(dept.department, {
      fy26Total: dept.totalsByYear.fy26Projection,
      percentChange: dept.percentChange,
      context: contextByDept.get(dept.department) || "",
    });
  }

  return deptCache;
}

/**
 * Look up budget context for a text string (vote description, follow-up, etc.).
 * Returns null if no department match is found.
 */
export function getBudgetContext(text: string): BudgetContextResult | null {
  if (!text || budget.departments.length === 0) return null;

  const cache = buildDeptCache();

  for (const [pattern, deptName] of KEYWORD_MAP) {
    if (pattern.test(text)) {
      const data = cache.get(deptName);
      if (!data) continue;

      return {
        department: deptName,
        fy26Total: data.fy26Total,
        percentChange: data.percentChange,
        contextSentence: data.context,
        budgetUrl: `/budget?dept=${encodeURIComponent(deptName)}`,
      };
    }
  }

  return null;
}
