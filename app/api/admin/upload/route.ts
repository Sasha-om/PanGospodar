import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/session";

/**
 * POST /api/admin/upload
 *
 * Issues short-lived Vercel Blob tokens so the admin panel can upload a product
 * photo straight from the browser to Blob storage.
 *
 * The file never passes through this route: a Server Action body is capped at
 * 1 MB and a serverless request at 4.5 MB, while a photo from a phone is often
 * larger. The client uploads directly and we only hand out the token — which is
 * why the session check below is the entire security boundary.
 *
 * Guarded by the admin session cookie, like the other /api/admin routes.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Vercel Blob free/pro limits are far higher; this is a sanity cap. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function isAdmin(): Promise<boolean> {
  try {
    return (await getSession()) !== null;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // Checked before handing the request to the SDK: `handleUpload` validates the
  // Blob token first, so an anonymous caller would otherwise get a confusing
  // configuration error instead of a plain 401.
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Re-checked here because this is the hook the SDK documents as the
        // authorization point, and it also covers the upload-completed call.
        if (!(await isAdmin())) {
          throw new Error("Unauthorized");
        }
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/avif",
            "image/gif",
          ],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          // Two products may both ship "photo.jpg" — keep them apart.
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Nothing to do: the admin form stores the returned URL with the
        // product when the form is saved. Vercel cannot reach localhost, so
        // this callback never fires in development anyway.
      },
    });

    return Response.json(result);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    const unauthorized = message === "Unauthorized";
    if (!unauthorized) {
      console.error(`[admin/upload] ${message}`);
    }
    return Response.json(
      { error: unauthorized ? "Unauthorized" : message },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
