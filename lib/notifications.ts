import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing Supabase env vars for notification service");
}

export const notificationSupabase = createClient(supabaseUrl, serviceKey);

export interface CreateNotificationParams {
  userId: string;
  title: string;
  body?: string;
  link?: string;
}

export async function createNotification(params: CreateNotificationParams) {
  const { error } = await notificationSupabase.from("notifications").insert({
    user_id: params.userId,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
    read: false,
  });

  if (error) {
    console.error("Failed to create notification:", error);
    throw error;
  }
}

export async function createNotificationsForUsers(
  userIds: string[],
  title: string,
  body?: string,
  link?: string
) {
  if (userIds.length === 0) return;

  const notifications = userIds.map((userId) => ({
    user_id: userId,
    title,
    body: body ?? null,
    link: link ?? null,
    read: false,
  }));

  const { error } = await notificationSupabase.from("notifications").insert(notifications);

  if (error) {
    console.error("Failed to create bulk notifications:", error);
    throw error;
  }
}

export async function getControlOfficers(): Promise<string[]> {
  const { data, error } = await notificationSupabase
    .from("profiles")
    .select("id")
    .eq("role", "control");

  if (error) {
    console.error("Failed to fetch control officers:", error);
    return [];
  }

  return (data ?? []).map((p) => p.id);
}

export async function getMaintenanceUsersForDepartment(department: string): Promise<string[]> {
  const { data, error } = await notificationSupabase
    .from("profiles")
    .select("id")
    .eq("role", "maintenance")
    .eq("department", department);

  if (error) {
    console.error("Failed to fetch maintenance users:", error);
    return [];
  }

  return (data ?? []).map((p) => p.id);
}

export async function getAllMaintenanceUsers(): Promise<string[]> {
  const { data, error } = await notificationSupabase
    .from("profiles")
    .select("id")
    .eq("role", "maintenance");

  if (error) {
    console.error("Failed to fetch maintenance users:", error);
    return [];
  }

  return (data ?? []).map((p) => p.id);
}

export async function checkAndNotifyUpcomingDefects() {
  const twoDaysFromNow = new Date();
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
  const twoDaysFromNowISO = twoDaysFromNow.toISOString().split('T')[0];

  const { data: defects, error } = await notificationSupabase
    .from("defects")
    .select("id, asset_description, work_description, department, due_date, linked_block_request_id")
    .eq("status", "open")
    .lte("due_date", twoDaysFromNowISO)
    .gte("due_date", new Date().toISOString().split('T')[0]);

  if (error) {
    console.error("Failed to fetch upcoming defects:", error);
    return;
  }

  if (!defects || defects.length === 0) {
    return;
  }

  // Group defects by department
  const defectsByDept: Record<string, typeof defects> = {};
  for (const defect of defects) {
    const dept = defect.department ?? 'Unassigned';
    if (!defectsByDept[dept]) defectsByDept[dept] = [];
    defectsByDept[dept].push(defect);
  }

  for (const [dept, deptDefects] of Object.entries(defectsByDept)) {
    let userIds: string[] = [];
    
    if (dept !== 'Unassigned') {
      userIds = await getMaintenanceUsersForDepartment(dept);
    } else {
      userIds = await getAllMaintenanceUsers();
    }

    if (userIds.length === 0) continue;

    const defectList = deptDefects
      .map((d) => `• ${d.asset_description ?? 'Unknown asset'} (due ${d.due_date})`)
      .join('\n');

    await createNotificationsForUsers(
      userIds,
      `Upcoming Defect Deadlines (${dept})`,
      `${deptDefects.length} defect(s) due within 2 days:\n${defectList}`,
      `/dashboard/maintenance?filter=upcoming`
    );
    console.log(`[notifications] Notified ${userIds.length} maintenance users in ${dept} of ${deptDefects.length} upcoming defects`);
  }
}