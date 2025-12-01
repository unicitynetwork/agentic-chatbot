export interface DayPass {
    unicityId: string;
    grantedAt: number;
    expiresAt: number;
}

export interface PendingPayment {
    unicityId: string;
    userPubkey: string;
    eventId: string;
    resolve: (success: boolean) => void;
    timeout: NodeJS.Timeout;
}
