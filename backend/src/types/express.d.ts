export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        role: 'ADMIN' | 'MEMBER';
        familyId: string | null;
        memberId: string | null;
      };
    }
  }
}
