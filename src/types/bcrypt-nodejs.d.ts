declare module 'bcrypt-nodejs' {
  export function compare(
    password: string,
    hash: string,
    callback: (err: Error | null, res: boolean) => void
  ): void;
  export function hashSync(password: string): string;
}
