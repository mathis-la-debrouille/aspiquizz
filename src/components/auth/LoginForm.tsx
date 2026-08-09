"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "@/server/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Nom d'utilisateur" name="username" autoComplete="username" required autoFocus />
      <Input
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state.error && (
        <p role="alert" className="text-14 text-clay-soft">
          {state.error}
        </p>
      )}
      <Button type="submit" loading={isPending} className="mt-2">
        Se connecter
      </Button>
    </form>
  );
}
