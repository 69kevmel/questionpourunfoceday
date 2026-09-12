import { useEffect, useRef } from 'react';

export default function ConfirmAction({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="confirmation-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirmation-title">Confirmer l’action</h2>
      <p>{message}</p>
      <div className="flex flex-wrap gap-3 mt-5">
        <button className="secondary" autoFocus onClick={onCancel}>
          Revenir au jeu
        </button>
        <button className="action" onClick={onConfirm}>
          Confirmer
        </button>
      </div>
    </dialog>
  );
}
