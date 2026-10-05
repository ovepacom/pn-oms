"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "./Modal";
import TripForm, { tripFields, type TripRecord } from "./TripForm";
import AuditHistory from "./AuditHistory";

// Hộp sửa một phiếu đã nhập, kèm lịch sử ai đã sửa gì
export default function TripEditor({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const [trip, setTrip] = useState<(TripRecord & { status: string }) | null>(null);
  useEffect(() => {
    createClient().from("trips").select(tripFields + ",status").eq("id", id).single().then(({ data }) => setTrip(data as never));
  }, [id]);
  return (
    <Modal title="Sửa phiếu" onClose={onClose} wide>
      {!trip ? <p>Đang tải...</p> : trip.status === "reconciled"
        ? <p className="text-slate-700">Phiếu đã đối soát nên không sửa được nữa.</p>
        : <TripForm trip={trip} onCancel={onClose} onSaved={() => { onSaved(); onClose(); }} />}
      <h3 className="mb-2 mt-6 font-semibold">Lịch sử sửa</h3>
      <AuditHistory table="trips" recordId={id} />
    </Modal>
  );
}
