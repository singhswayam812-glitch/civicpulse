// CivicPulse real API (Supabase).
// Same function names and return shapes as js/mock-api.js.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const CATEGORIES = ["streetlight", "bin", "road", "drain"];
const STATUSES = ["submitted", "under_review", "resolved"];
const PHOTO_BUCKET = "report-photos";
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_NOTE_LENGTH = 500;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
const PHOTO_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};
const MAX_REF_ATTEMPTS = 5;

// Open issues of the same category within this distance count as "nearby".
const NEARBY_RADIUS_M = 50;
// Slightly generous so the bounding-box prefilter never cuts off a true match;
// the exact Haversine check below does the real filtering.
const METERS_PER_DEGREE = 111000;

let client = null;

// Created lazily so a missing config produces a readable error at call time
// instead of breaking the module import.
function getClient() {
  if (client) return client;

  const urlMissing =
    !SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT-REF");
  const keyMissing =
    !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("YOUR-ANON-PUBLIC-KEY");

  if (urlMissing || keyMissing) {
    throw new Error(
      "Supabase is not configured. Open js/config.js and set SUPABASE_URL and SUPABASE_ANON_KEY."
    );
  }

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

function fail(action, error) {
  const detail = error && error.message ? error.message : String(error);
  return new Error(`Could not ${action}: ${detail}`);
}

// ---------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

// Haversine great-circle distance between two points, in meters.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const EARTH_RADIUS_M = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * getIssues({category?, status?}) -> Issue[]
 * Newest first. Filters are applied only when provided.
 */
export async function getIssues({ category, status } = {}) {
  const supabase = getClient();

  let query = supabase
    .from("issues")
    .select("*")
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw fail("load issues", error);

  return data || [];
}

/**
 * getIssue(id) -> {...issue, reports: Report[], status_events: StatusEvent[]}
 * reports and status_events are ordered oldest first.
 */
export async function getIssue(id) {
  if (!id) throw new Error("Could not load issue: no issue id was provided.");

  const supabase = getClient();

  const [issueRes, reportsRes, eventsRes] = await Promise.all([
    supabase.from("issues").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("reports")
      .select("*")
      .eq("issue_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("status_events")
      .select("*")
      .eq("issue_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (issueRes.error) throw fail("load issue", issueRes.error);
  if (!issueRes.data) throw new Error("Could not load issue: issue not found.");
  if (reportsRes.error) throw fail("load reports for this issue", reportsRes.error);
  if (eventsRes.error) throw fail("load status history for this issue", eventsRes.error);

  return {
    ...issueRes.data,
    reports: reportsRes.data || [],
    status_events: eventsRes.data || [],
  };
}

// ---------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------

function toCoordinate(value) {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}

// Validates category + coordinates. `prefix` makes the error message
// read naturally for the caller (e.g. "Invalid report", "Invalid search").
function validateLocation(prefix, { category, lat, lng }) {
  if (!CATEGORIES.includes(category)) {
    throw new Error(
      `${prefix}: category must be one of ${CATEGORIES.join(", ")}.`
    );
  }

  const latNum = toCoordinate(lat);
  const lngNum = toCoordinate(lng);

  if (typeof latNum !== "number" || !Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    throw new Error(`${prefix}: latitude must be a number between -90 and 90.`);
  }
  if (typeof lngNum !== "number" || !Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
    throw new Error(`${prefix}: longitude must be a number between -180 and 180.`);
  }

  return { latNum, lngNum };
}

function validateReportInput({ category, lat, lng, description, photo }) {
  const { latNum, lngNum } = validateLocation("Invalid report", {
    category,
    lat,
    lng,
  });

  if (typeof description !== "string" || description.trim() === "") {
    throw new Error("Invalid report: please add a short description of the problem.");
  }
  const cleanDescription = description.trim();
  if (cleanDescription.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Invalid report: description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`
    );
  }

  if (photo !== undefined && photo !== null) {
    if (typeof Blob === "undefined" || !(photo instanceof Blob)) {
      throw new Error("Invalid report: photo must be a file.");
    }
    if (!PHOTO_EXTENSIONS[photo.type]) {
      throw new Error(
        "Invalid report: photo must be a JPEG, PNG, WebP, GIF or HEIC image."
      );
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      throw new Error("Invalid report: photo must be 10 MB or smaller.");
    }
  }

  return { latNum, lngNum, cleanDescription };
}

// ---------------------------------------------------------------------
// findNearbyIssues
// ---------------------------------------------------------------------

/**
 * findNearbyIssues(category, lat, lng) -> Issue[]
 * Open (not resolved) issues of the same category within NEARBY_RADIUS_M,
 * nearest first. Each result has an extra distance_m field (meters).
 */
export async function findNearbyIssues(category, lat, lng) {
  const { latNum, lngNum } = validateLocation("Invalid search", {
    category,
    lat,
    lng,
  });

  const supabase = getClient();

  // Cheap bounding-box prefilter in SQL, exact Haversine check in JS.
  const latDelta = NEARBY_RADIUS_M / METERS_PER_DEGREE;
  const lngDelta =
    NEARBY_RADIUS_M /
    (METERS_PER_DEGREE * Math.max(Math.cos(toRadians(latNum)), 0.01));

  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("category", category)
    .neq("status", "resolved")
    .gte("lat", latNum - latDelta)
    .lte("lat", latNum + latDelta)
    .gte("lng", lngNum - lngDelta)
    .lte("lng", lngNum + lngDelta);
  if (error) throw fail("search for nearby issues", error);

  return (data || [])
    .map((issue) => ({
      ...issue,
      distance_m: distanceMeters(latNum, lngNum, issue.lat, issue.lng),
    }))
    .filter((issue) => issue.distance_m <= NEARBY_RADIUS_M)
    .sort((a, b) => a.distance_m - b.distance_m)
    .map((issue) => ({
      ...issue,
      distance_m: Math.round(issue.distance_m * 10) / 10,
    }));
}

// ---------------------------------------------------------------------
// submitReport helpers
// ---------------------------------------------------------------------

async function uploadPhoto(supabase, photo) {
  const ext = PHOTO_EXTENSIONS[photo.type];
  const uniqueName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(uniqueName, photo, { contentType: photo.type, upsert: false });
  if (error) throw fail("upload the photo", error);

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(uniqueName);
  return data.publicUrl;
}

// Format: CP-YYYY-XXXXX (5 random digits)
function generateRefNo() {
  const year = new Date().getFullYear();
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 100000;
  return `CP-${year}-${String(random).padStart(5, "0")}`;
}

// Inserts the issue, retrying with a new ref_no if the unique constraint trips.
async function insertIssueWithUniqueRef(supabase, fields) {
  for (let attempt = 1; attempt <= MAX_REF_ATTEMPTS; attempt++) {
    const ref_no = generateRefNo();
    const { data, error } = await supabase
      .from("issues")
      .insert({ ...fields, ref_no, status: "submitted", affected_count: 1 })
      .select()
      .single();

    if (!error) return data;

    // 23505 = unique_violation: that ref_no already exists, so try another.
    if (error.code === "23505") continue;

    throw fail("create the issue", error);
  }
  throw new Error(
    "Could not create the issue: unable to generate a unique reference number. Please try again."
  );
}

// ATTACH path: add a report to an existing issue and recount affected_count.
// Does not create a new issue or a new status_events row.
async function attachReportToIssue(
  supabase,
  { attachToIssueId, category, cleanDescription, photo }
) {
  const { data: existing, error: lookupError } = await supabase
    .from("issues")
    .select("*")
    .eq("id", attachToIssueId)
    .maybeSingle();
  if (lookupError) throw fail("find the issue to attach to", lookupError);
  if (!existing) {
    throw new Error("Could not submit report: the issue to attach to was not found.");
  }
  if (existing.status === "resolved") {
    throw new Error(
      `Could not submit report: issue ${existing.ref_no} is already marked resolved. Please submit a new report instead.`
    );
  }
  if (existing.category !== category) {
    throw new Error(
      `Could not submit report: issue ${existing.ref_no} is a ${existing.category} issue, not ${category}.`
    );
  }

  // Upload first so a failed upload doesn't leave a report without its photo.
  let photo_url = null;
  if (photo) photo_url = await uploadPhoto(supabase, photo);

  const { error: reportError } = await supabase.from("reports").insert({
    issue_id: existing.id,
    description: cleanDescription,
    photo_url,
  });
  if (reportError) throw fail("save the report", reportError);

  // Recount rather than +1, so affected_count can never drift from reality.
  const { count, error: countError } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("issue_id", existing.id);
  if (countError || count === null) {
    throw fail(
      `update the affected count (your report was saved to issue ${existing.ref_no})`,
      countError || new Error("no count returned")
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("issues")
    .update({ affected_count: count })
    .eq("id", existing.id)
    .select()
    .single();
  if (updateError) {
    throw fail(
      `update the affected count (your report was saved to issue ${existing.ref_no})`,
      updateError
    );
  }

  return { issue: updated, ref_no: updated.ref_no, merged: true };
}

// CREATE path: new issue + first report + first status event.
async function createNewIssue(
  supabase,
  { category, latNum, lngNum, cleanDescription, photo }
) {
  // Upload first so a failed upload doesn't leave a half-created issue behind.
  let photo_url = null;
  if (photo) photo_url = await uploadPhoto(supabase, photo);

  const issue = await insertIssueWithUniqueRef(supabase, {
    category,
    lat: latNum,
    lng: lngNum,
  });

  const { error: reportError } = await supabase.from("reports").insert({
    issue_id: issue.id,
    description: cleanDescription,
    photo_url,
  });
  if (reportError) {
    throw fail(`save the report details (issue ${issue.ref_no} was created)`, reportError);
  }

  const { error: eventError } = await supabase.from("status_events").insert({
    issue_id: issue.id,
    status: "submitted",
    note: "Report received from a community member.",
  });
  if (eventError) {
    throw fail(`record the first status update (issue ${issue.ref_no} was created)`, eventError);
  }

  return { issue, ref_no: issue.ref_no, merged: false };
}

/**
 * submitReport({category, lat, lng, description, photo?, attachToIssueId?})
 *   -> {issue, ref_no, merged: boolean}
 *
 * Without attachToIssueId: creates a new issue (merged: false).
 * With attachToIssueId: adds the report to that issue (merged: true).
 */
export async function submitReport({
  category,
  lat,
  lng,
  description,
  photo,
  attachToIssueId,
} = {}) {
  const { latNum, lngNum, cleanDescription } = validateReportInput({
    category,
    lat,
    lng,
    description,
    photo,
  });

  const supabase = getClient();

  if (attachToIssueId) {
    return attachReportToIssue(supabase, {
      attachToIssueId,
      category,
      cleanDescription,
      photo,
    });
  }

  return createNewIssue(supabase, {
    category,
    latNum,
    lngNum,
    cleanDescription,
    photo,
  });
}

// ---------------------------------------------------------------------
// updateStatus
// ---------------------------------------------------------------------

/**
 * updateStatus(issueId, status, note) -> StatusEvent
 * Sets issues.status and records a status_events row; returns that new event.
 * Moving an issue out of 'resolved' (reopening it) requires a note.
 */
export async function updateStatus(issueId, status, note) {
  if (!issueId) {
    throw new Error("Could not update status: no issue id was provided.");
  }
  if (!STATUSES.includes(status)) {
    throw new Error(`Invalid status: must be one of ${STATUSES.join(", ")}.`);
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    throw new Error("Invalid note: note must be text.");
  }
  const cleanNote = typeof note === "string" ? note.trim() : "";
  if (cleanNote.length > MAX_NOTE_LENGTH) {
    throw new Error(`Invalid note: note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }

  const supabase = getClient();

  const { data: existing, error: lookupError } = await supabase
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle();
  if (lookupError) throw fail("find the issue", lookupError);
  if (!existing) {
    throw new Error("Could not update status: issue not found.");
  }

  if (existing.status === status) {
    throw new Error(
      `Could not update status: issue ${existing.ref_no} is already ${status}.`
    );
  }
  if (existing.status === "resolved" && !cleanNote) {
    throw new Error(
      `Could not update status: a note is required to move issue ${existing.ref_no} out of resolved.`
    );
  }

  const { error: updateError } = await supabase
    .from("issues")
    .update({ status })
    .eq("id", existing.id);
  if (updateError) throw fail("update the issue status", updateError);

  const { data: event, error: eventError } = await supabase
    .from("status_events")
    .insert({
      issue_id: existing.id,
      status,
      note: cleanNote || null,
    })
    .select()
    .single();
  if (eventError) {
    throw fail(
      `record the status update (issue ${existing.ref_no} is now ${status} but has no history entry for it)`,
      eventError
    );
  }

  return event;
}

// ---------------------------------------------------------------------
// getDashboardStats
// ---------------------------------------------------------------------

const TOP_ISSUES_LIMIT = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000; // Supabase returns at most 1000 rows per request

// Reads every row of a query by paging, so stats are never silently truncated.
// `buildQuery` must return a fresh query builder each time it is called.
async function fetchAllRows(buildQuery, action) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery()
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw fail(action, error);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * getDashboardStats() -> {
 *   total, byCategory:{}, byStatus:{}, topIssues: Issue[],
 *   totalResidentsAffected, avgResolutionDays
 * }
 *
 * - byCategory / byStatus always include every contract value (0 if none).
 * - topIssues: top 5 open (not resolved) issues by affected_count; ties go to
 *   the issue that has been waiting longest.
 * - totalResidentsAffected: sum of affected_count across all issues.
 * - avgResolutionDays: for issues currently resolved, the average days from
 *   created_at to their latest 'resolved' status event; null if none.
 */
export async function getDashboardStats() {
  const supabase = getClient();

  const [issues, resolvedEvents] = await Promise.all([
    fetchAllRows(
      () => supabase.from("issues").select("*"),
      "load issues for the dashboard"
    ),
    fetchAllRows(
      () =>
        supabase
          .from("status_events")
          .select("issue_id, created_at")
          .eq("status", "resolved"),
      "load resolution history for the dashboard"
    ),
  ]);

  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let totalResidentsAffected = 0;

  for (const issue of issues) {
    byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
    byStatus[issue.status] = (byStatus[issue.status] || 0) + 1;
    totalResidentsAffected += issue.affected_count || 0;
  }

  const topIssues = issues
    .filter((issue) => issue.status !== "resolved")
    .sort(
      (a, b) =>
        (b.affected_count || 0) - (a.affected_count || 0) ||
        Date.parse(a.created_at) - Date.parse(b.created_at)
    )
    .slice(0, TOP_ISSUES_LIMIT);

  // Latest 'resolved' event time per issue (an issue may be reopened and re-resolved).
  const latestResolvedAt = new Map();
  for (const event of resolvedEvents) {
    const time = Date.parse(event.created_at);
    if (Number.isNaN(time)) continue;
    const previous = latestResolvedAt.get(event.issue_id);
    if (previous === undefined || time > previous) {
      latestResolvedAt.set(event.issue_id, time);
    }
  }

  const durationsInDays = [];
  for (const issue of issues) {
    if (issue.status !== "resolved") continue;
    const resolvedAt = latestResolvedAt.get(issue.id);
    const createdAt = Date.parse(issue.created_at);
    if (resolvedAt === undefined || Number.isNaN(createdAt)) continue;
    durationsInDays.push(Math.max(0, resolvedAt - createdAt) / MS_PER_DAY);
  }

  const avgResolutionDays = durationsInDays.length
    ? Math.round(
        (durationsInDays.reduce((sum, d) => sum + d, 0) / durationsInDays.length) * 100
      ) / 100
    : null;

  return {
    total: issues.length,
    byCategory,
    byStatus,
    topIssues,
    totalResidentsAffected,
    avgResolutionDays,
  };
}
