"use server";

import { supabase } from "@/lib/supabaseClient";
import { unstable_noStore as noStore } from "next/cache";

const SOURCE_FIELD_MAP: Record<string, string[]> = {
  rc: ["calls", "inbound", "outbound", "talk_time_seconds"],
  rico_ap: ["calls", "inbound", "outbound"],
  rico_ch: ["talk_time_seconds"],
  hs: ["texts", "out_texts", "opt_ins", "opt_outs"],
  quotes: ["quotes", "quotes_deduped"],
  nb: ["nb_count", "items", "written_premium", "nb_auto_count", "nb_auto_items"],
  premium: ["prem_premium", "prem_items", "prem_points"],
};

/* -------------------------------------------------------------------------- */
/*  Action 1 – getUploadHistory                                               */
/* -------------------------------------------------------------------------- */

export async function getUploadHistory(page: number, pageSize: number = 10) {
  noStore();

  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Fetch the page of uploads
    const { data: uploads, error: uploadsError } = await supabase
      .from("upload_history")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .range(from, to);

    if (uploadsError) {
      return { success: false, error: uploadsError.message };
    }

    // Fetch total count
    const { count: totalCount, error: countError } = await supabase
      .from("upload_history")
      .select("*", { count: "exact", head: true });

    if (countError) {
      return { success: false, error: countError.message };
    }

    // For each upload, fetch its associated files
    const uploadsWithFiles = await Promise.all(
      (uploads ?? []).map(async (upload) => {
        const { data: files, error: filesError } = await supabase
          .from("upload_history_files")
          .select("*")
          .eq("upload_id", upload.id);

        if (filesError) {
          console.error(
            `Error fetching files for upload ${upload.id}:`,
            filesError.message,
          );
          return { ...upload, files: [] };
        }

        return { ...upload, files: files ?? [] };
      }),
    );

    return {
      success: true,
      data: {
        uploads: uploadsWithFiles,
        totalCount: totalCount ?? 0,
        page,
        pageSize,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Action 2 – reassignFileDate                                               */
/* -------------------------------------------------------------------------- */

export async function reassignFileDate(fileId: string, newDate: string) {
  try {
    // 1. Fetch the file record
    const { data: file, error: fileError } = await supabase
      .from("upload_history_files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return { success: false, error: fileError?.message ?? "File not found" };
    }

    // 2. Only allow reassignment when there is no internal date
    if (file.has_internal_date) {
      return {
        success: false,
        error:
          "Cannot reassign a file that has an internal date. Only files without an internal date can be reassigned.",
      };
    }

    const fileType: string = file.file_type;
    const oldDate: string = file.target_date;
    const columns = SOURCE_FIELD_MAP[fileType];

    if (!columns || columns.length === 0) {
      return {
        success: false,
        error: `Unknown file type "${fileType}" – no column mapping found.`,
      };
    }

    // 3. Fetch all daily_metrics rows for the old date with relevant columns
    const selectFields = ["agent_id", ...columns].join(", ");

    const { data: oldRows, error: oldRowsError } = await supabase
      .from("daily_metrics")
      .select(selectFields)
      .eq("report_date", oldDate);

    if (oldRowsError) {
      return { success: false, error: oldRowsError.message };
    }

    if (!oldRows || oldRows.length === 0) {
      // Nothing to move – still mark the file as reassigned
      const { error: updateErr } = await supabase
        .from("upload_history_files")
        .update({
          original_date: oldDate,
          target_date: newDate,
          status: "reassigned",
        })
        .eq("id", fileId);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }

      return { success: true };
    }

    // 4. For each agent, move the field values from old date to new date
    for (const row of oldRows) {
      const agentId = row.agent_id;

      // Fetch existing row for the new date (if any)
      const { data: existingNewRow, error: fetchNewErr } = await supabase
        .from("daily_metrics")
        .select(selectFields)
        .eq("report_date", newDate)
        .eq("agent_id", agentId)
        .maybeSingle();

      if (fetchNewErr) {
        console.error(
          `Error fetching new-date row for agent ${agentId}:`,
          fetchNewErr.message,
        );
        continue;
      }

      // Build the upsert payload – merge (add) values if a row already exists
      const upsertPayload: Record<string, unknown> = {
        agent_id: agentId,
        report_date: newDate,
      };

      for (const col of columns) {
        const incoming = (row as Record<string, unknown>)[col] ?? 0;
        const existing =
          existingNewRow
            ? ((existingNewRow as Record<string, unknown>)[col] ?? 0)
            : 0;
        upsertPayload[col] = Number(existing) + Number(incoming);
      }

      const { error: upsertErr } = await supabase
        .from("daily_metrics")
        .upsert(upsertPayload, { onConflict: "agent_id,report_date" });

      if (upsertErr) {
        console.error(
          `Error upserting new-date row for agent ${agentId}:`,
          upsertErr.message,
        );
        continue;
      }

      // Zero out the source fields on the old date row
      const zeroPayload: Record<string, number> = {};
      for (const col of columns) {
        zeroPayload[col] = 0;
      }

      const { error: zeroErr } = await supabase
        .from("daily_metrics")
        .update(zeroPayload)
        .eq("report_date", oldDate)
        .eq("agent_id", agentId);

      if (zeroErr) {
        console.error(
          `Error zeroing old-date row for agent ${agentId}:`,
          zeroErr.message,
        );
      }
    }

    // 5. Update the file record
    const { error: updateFileErr } = await supabase
      .from("upload_history_files")
      .update({
        original_date: oldDate,
        target_date: newDate,
        status: "reassigned",
      })
      .eq("id", fileId);

    if (updateFileErr) {
      return { success: false, error: updateFileErr.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Action 3 – reassignUploadDate                                             */
/* -------------------------------------------------------------------------- */

export async function reassignUploadDate(uploadId: string, newDate: string) {
  try {
    // 1. Fetch all files for this upload
    const { data: files, error: filesError } = await supabase
      .from("upload_history_files")
      .select("*")
      .eq("upload_id", uploadId);

    if (filesError) {
      return { success: false, error: filesError.message };
    }

    if (!files || files.length === 0) {
      return { success: false, error: "No files found for this upload." };
    }

    // 2. Filter to eligible files (no internal date and currently active)
    const eligible = files.filter(
      (f) => !f.has_internal_date && f.status === "active",
    );

    if (eligible.length === 0) {
      return {
        success: false,
        error: "No eligible files to reassign (all files either have an internal date or are not active).",
      };
    }

    // 3. Reassign each eligible file
    let reassignedCount = 0;

    for (const file of eligible) {
      const result = await reassignFileDate(file.id, newDate);
      if (result.success) {
        reassignedCount++;
      } else {
        console.error(
          `Failed to reassign file ${file.id}:`,
          result.error,
        );
      }
    }

    // 4. Update the upload record status if any files were reassigned
    if (reassignedCount > 0) {
      const { error: updateErr } = await supabase
        .from("upload_history")
        .update({ status: "reassigned" })
        .eq("id", uploadId);

      if (updateErr) {
        console.error(
          "Error updating upload status:",
          updateErr.message,
        );
      }
    }

    return {
      success: true,
      data: {
        reassignedCount,
        totalEligible: eligible.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Action 4 – deleteUploadData                                               */
/* -------------------------------------------------------------------------- */

export async function deleteUploadData(uploadId: string) {
  try {
    // 1. Fetch the upload record
    const { data: upload, error: uploadError } = await supabase
      .from("upload_history")
      .select("*")
      .eq("id", uploadId)
      .single();

    if (uploadError || !upload) {
      return {
        success: false,
        error: uploadError?.message ?? "Upload not found",
      };
    }

    // Delete any associated quote records
    const { error: quoteDelErr } = await supabase
      .from("quote_records")
      .delete()
      .eq("upload_id", uploadId);

    if (quoteDelErr) {
      console.error(`Error deleting quote_records for upload ${uploadId}:`, quoteDelErr.message);
    }

    // 2. Fetch all files for this upload
    const { data: files, error: filesError } = await supabase
      .from("upload_history_files")
      .select("*")
      .eq("upload_id", uploadId);

    if (filesError) {
      return { success: false, error: filesError.message };
    }

    if (!files || files.length === 0) {
      return { success: false, error: "No files found for this upload." };
    }

    // 3. For each file, zero out the corresponding fields in daily_metrics
    for (const file of files) {
      const fileType: string = file.file_type;
      const targetDate: string = file.target_date;
      const columns = SOURCE_FIELD_MAP[fileType];

      if (!columns || columns.length === 0) {
        console.error(`Unknown file type "${fileType}" – skipping.`);
        continue;
      }

      // Fetch all agents on the target date
      const { data: rows, error: rowsError } = await supabase
        .from("daily_metrics")
        .select("agent_id")
        .eq("report_date", targetDate);

      if (rowsError) {
        console.error(
          `Error fetching daily_metrics for date ${targetDate}:`,
          rowsError.message,
        );
        continue;
      }

      if (!rows || rows.length === 0) continue;

      // Zero out the specific fields for every agent on that date
      const zeroPayload: Record<string, number> = {};
      for (const col of columns) {
        zeroPayload[col] = 0;
      }

      const { error: zeroErr } = await supabase
        .from("daily_metrics")
        .update(zeroPayload)
        .eq("report_date", targetDate);

      if (zeroErr) {
        console.error(
          `Error zeroing fields for date ${targetDate}:`,
          zeroErr.message,
        );
      }
    }

    // 4. Mark all files as deleted
    const { error: updateFilesErr } = await supabase
      .from("upload_history_files")
      .update({ status: "deleted" })
      .eq("upload_id", uploadId);

    if (updateFilesErr) {
      return { success: false, error: updateFilesErr.message };
    }

    // 5. Mark the upload as deleted
    const { error: updateUploadErr } = await supabase
      .from("upload_history")
      .update({ status: "deleted" })
      .eq("id", uploadId);

    if (updateUploadErr) {
      return { success: false, error: updateUploadErr.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
