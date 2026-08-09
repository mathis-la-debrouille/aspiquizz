"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { updateProfileAction } from "@/server/progression/actions";

export function EditProfileModal({
  open,
  onClose,
  initialDisplayName,
  initialBio,
}: {
  open: boolean;
  onClose: () => void;
  initialDisplayName: string;
  initialBio: string;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync from props each time the modal opens — it stays mounted between opens, so a save
  // (which changes the parent's initial* props via revalidatePath) wouldn't otherwise be
  // reflected the next time it's reopened.
  useEffect(() => {
    if (open) {
      setDisplayName(initialDisplayName);
      setBio(initialBio);
      setError(null);
    }
  }, [open, initialDisplayName, initialBio]);

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await updateProfileAction({ displayName, bio: bio || undefined });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifier le profil"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={pending} disabled={!displayName.trim()} onClick={handleSave}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Nom affiché"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
        />
        <Textarea
          label="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          hint={`${bio.length}/280`}
        />
        {error && <p className="text-14 text-clay-soft">{error}</p>}
      </div>
    </Modal>
  );
}
