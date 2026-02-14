import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

type Booking = {
  id: string;
  teacher_id: string;
  status: string;
  receipt_url: string | null;
  created_at: string;
};

export default function PendingRequestsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("bookings")
      .select("id, teacher_id, status, receipt_url, created_at")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) setBookings(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchBookings();
  }, [user]);

  const uploadReceipt = async (bookingId: string, file: File) => {
    const filePath = `receipts/${bookingId}/${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      alert("Upload failed");
      return;
    }

    const { data } = supabase.storage.from("receipts").getPublicUrl(filePath);

    await supabase
      .from("bookings")
      .update({
        receipt_url: data.publicUrl,
        status: "pending_review",
        receipt_uploaded_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    fetchBookings();
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">My Requests</h1>

      {bookings.length === 0 && <p>No requests yet</p>}

      {bookings.map((b) => (
        <Card key={b.id} className="p-4 flex justify-between items-center">
          <div>
            <p className="font-medium">Booking #{b.id.slice(0, 6)}</p>
            <p className="text-sm text-muted-foreground">
              Status: {b.status}
            </p>
          </div>

          {b.status === "awaiting_receipt" && (
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (!e.target.files?.[0]) return;
                uploadReceipt(b.id, e.target.files[0]);
              }}
            />
          )}

          {b.status === "pending_review" && (
            <span className="text-yellow-600 font-medium">
              Waiting for teacher review
            </span>
          )}

          {b.status === "accepted" && (
            <span className="text-green-600 font-medium">
              Accepted — open chat soon
            </span>
          )}

          {b.status === "declined" && (
            <span className="text-red-600 font-medium">
              Declined
            </span>
          )}
        </Card>
      ))}
    </div>
  );
}
