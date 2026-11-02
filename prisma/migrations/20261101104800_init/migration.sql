-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RoleKind" AS ENUM ('MAIN', 'CALLER');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('IDENTITY_CHECK', 'PENDING_REVIEW', 'APPROVED_WAITING_CALLER', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'AUTO_REJECTED_COOLDOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('GOOGLE_FORMS', 'MANUAL', 'DISCORD');

-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('VERIFIED', 'LINK_RESOLVED', 'UNRESOLVED', 'CONFLICT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'BOT', 'SERVICE');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('APPROVED', 'REJECTED', 'AUTO_REJECTED');

-- CreateEnum
CREATE TYPE "DecisionChannel" AS ENUM ('VK_BOT', 'WEB', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CallSessionStatus" AS ENUM ('IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('PASSED', 'FAILED', 'REFUSED', 'POSTPONED');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'ERROR');

-- CreateEnum
CREATE TYPE "IntegrationSource" AS ENUM ('GOOGLE_FORMS', 'VK_CALLBACK', 'DISCORD');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'REJECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "vkId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "discordId" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "blockedReason" TEXT,
    "vkMessagesAllowed" BOOLEAN,
    "vkMessagesCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastLoginAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RoleKind" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8B5CF6',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "group" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "kind" "RoleKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedById" TEXT,
    "comment" TEXT,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "receiveApplications" BOOLEAN NOT NULL DEFAULT true,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canReject" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LeadershipMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ServiceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "vkId" TEXT NOT NULL,
    "vkScreenName" TEXT,
    "nickname" TEXT,
    "fullName" TEXT,
    "discordId" TEXT,
    "vkVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateLinkCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CandidateLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" SERIAL NOT NULL,
    "candidateId" TEXT,
    "activeCandidateKey" TEXT,
    "source" "ApplicationSource" NOT NULL DEFAULT 'GOOGLE_FORMS',
    "externalId" TEXT,
    "nickname" TEXT NOT NULL,
    "fullName" TEXT,
    "vkProfileRaw" TEXT,
    "vkId" TEXT,
    "identityStatus" "IdentityStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "identityNote" TEXT,
    "status" "ApplicationStatus" NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionSource" "ActorType",
    "rejectReason" TEXT,
    "cooldownLastFailedAt" TIMESTAMPTZ(3),
    "cooldownUntil" TIMESTAMPTZ(3),
    "currentAssigneeId" TEXT,
    "assignedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "candidateNotified" BOOLEAN NOT NULL DEFAULT false,
    "candidateNotifiedById" TEXT,
    "candidateNotifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAnswer" (
    "id" TEXT NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,

    CONSTRAINT "ApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDecision" (
    "id" TEXT NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "decision" "DecisionType" NOT NULL,
    "source" "ActorType" NOT NULL,
    "channel" "DecisionChannel" NOT NULL,
    "userId" TEXT,
    "userNickname" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAssignment" (
    "id" TEXT NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "kind" TEXT NOT NULL,
    "activeKey" INTEGER,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ApplicationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "callerId" TEXT NOT NULL,
    "status" "CallSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "activeKey" INTEGER,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "durationSec" INTEGER,
    "discordChannelId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallResult" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "outcome" "CallOutcome" NOT NULL,
    "reason" TEXT,
    "comment" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CooldownRestriction" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "vkId" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "failedAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "liftedAt" TIMESTAMPTZ(3),
    "liftedById" TEXT,
    "liftReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CooldownRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationComment" (
    "id" TEXT NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" INTEGER,
    "candidateId" TEXT,
    "type" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "comment" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "applicationId" INTEGER,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "source" "IntegrationSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "dedupeKey" TEXT,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB,
    "error" TEXT,
    "applicationId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationDelivery" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'VK',
    "kind" TEXT NOT NULL,
    "applicationId" INTEGER,
    "recipientId" TEXT,
    "peerId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "errorCode" INTEGER,
    "messageText" TEXT,
    "vkMessageId" INTEGER,
    "conversationMessageId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntegrationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotConversationState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotConversationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RealtimeEvent" (
    "id" BIGSERIAL NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_vkId_key" ON "User"("vkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE INDEX "Role_kind_sortOrder_idx" ON "Role"("kind", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_kind_key" ON "UserRole"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "RegistrationRequest_status_createdAt_idx" ON "RegistrationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RegistrationRequest_userId_idx" ON "RegistrationRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipMember_userId_key" ON "LeadershipMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceToken_tokenHash_key" ON "ServiceToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_vkId_key" ON "Candidate"("vkId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_discordId_key" ON "Candidate"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateLinkCode_code_key" ON "CandidateLinkCode"("code");

-- CreateIndex
CREATE INDEX "CandidateLinkCode_candidateId_idx" ON "CandidateLinkCode"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_activeCandidateKey_key" ON "Application"("activeCandidateKey");

-- CreateIndex
CREATE INDEX "Application_status_submittedAt_idx" ON "Application"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "Application_candidateId_submittedAt_idx" ON "Application"("candidateId", "submittedAt");

-- CreateIndex
CREATE INDEX "Application_vkId_idx" ON "Application"("vkId");

-- CreateIndex
CREATE INDEX "Application_decidedById_idx" ON "Application"("decidedById");

-- CreateIndex
CREATE INDEX "Application_currentAssigneeId_status_idx" ON "Application"("currentAssigneeId", "status");

-- CreateIndex
CREATE INDEX "Application_submittedAt_idx" ON "Application"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_source_externalId_key" ON "Application"("source", "externalId");

-- CreateIndex
CREATE INDEX "ApplicationAnswer_applicationId_position_idx" ON "ApplicationAnswer"("applicationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDecision_applicationId_key" ON "ApplicationDecision"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationDecision_userId_createdAt_idx" ON "ApplicationDecision"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationDecision_decision_createdAt_idx" ON "ApplicationDecision"("decision", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationAssignment_activeKey_key" ON "ApplicationAssignment"("activeKey");

-- CreateIndex
CREATE INDEX "ApplicationAssignment_applicationId_idx" ON "ApplicationAssignment"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationAssignment_userId_assignedAt_idx" ON "ApplicationAssignment"("userId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallSession_activeKey_key" ON "CallSession"("activeKey");

-- CreateIndex
CREATE INDEX "CallSession_applicationId_idx" ON "CallSession"("applicationId");

-- CreateIndex
CREATE INDEX "CallSession_callerId_endedAt_idx" ON "CallSession"("callerId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallResult_callSessionId_key" ON "CallResult"("callSessionId");

-- CreateIndex
CREATE INDEX "CallResult_outcome_createdAt_idx" ON "CallResult"("outcome", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CooldownRestriction_callSessionId_key" ON "CooldownRestriction"("callSessionId");

-- CreateIndex
CREATE INDEX "CooldownRestriction_vkId_failedAt_idx" ON "CooldownRestriction"("vkId", "failedAt");

-- CreateIndex
CREATE INDEX "CooldownRestriction_candidateId_failedAt_idx" ON "CooldownRestriction"("candidateId", "failedAt");

-- CreateIndex
CREATE INDEX "ApplicationComment_applicationId_createdAt_idx" ON "ApplicationComment"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_createdAt_idx" ON "ApplicationEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationEvent_candidateId_createdAt_idx" ON "ApplicationEvent"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationEvent_createdAt_idx" ON "ApplicationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_applicationId_idx" ON "AuditLog"("applicationId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_source_createdAt_idx" ON "IntegrationEvent"("source", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_status_createdAt_idx" ON "IntegrationEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_externalId_idx" ON "IntegrationEvent"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_source_dedupeKey_key" ON "IntegrationEvent"("source", "dedupeKey");

-- CreateIndex
CREATE INDEX "IntegrationDelivery_status_createdAt_idx" ON "IntegrationDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationDelivery_applicationId_idx" ON "IntegrationDelivery"("applicationId");

-- CreateIndex
CREATE INDEX "IntegrationDelivery_recipientId_idx" ON "IntegrationDelivery"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "BotConversationState_userId_key" ON "BotConversationState"("userId");

-- CreateIndex
CREATE INDEX "RealtimeEvent_createdAt_idx" ON "RealtimeEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipMember" ADD CONSTRAINT "LeadershipMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceToken" ADD CONSTRAINT "ServiceToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateLinkCode" ADD CONSTRAINT "CandidateLinkCode_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_currentAssigneeId_fkey" FOREIGN KEY ("currentAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateNotifiedById_fkey" FOREIGN KEY ("candidateNotifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAssignment" ADD CONSTRAINT "ApplicationAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAssignment" ADD CONSTRAINT "ApplicationAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAssignment" ADD CONSTRAINT "ApplicationAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallResult" ADD CONSTRAINT "CallResult_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallResult" ADD CONSTRAINT "CallResult_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooldownRestriction" ADD CONSTRAINT "CooldownRestriction_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooldownRestriction" ADD CONSTRAINT "CooldownRestriction_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooldownRestriction" ADD CONSTRAINT "CooldownRestriction_liftedById_fkey" FOREIGN KEY ("liftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationComment" ADD CONSTRAINT "ApplicationComment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationComment" ADD CONSTRAINT "ApplicationComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDelivery" ADD CONSTRAINT "IntegrationDelivery_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDelivery" ADD CONSTRAINT "IntegrationDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotConversationState" ADD CONSTRAINT "BotConversationState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
