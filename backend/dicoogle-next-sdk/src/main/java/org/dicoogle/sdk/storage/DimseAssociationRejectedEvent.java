package org.dicoogle.sdk.storage;

/**
 * Describes a DIMSE association request that was rejected by the server's access policy.
 *
 * <p>Unlike {@link DimseAssociationFailedEvent}, a rejection is an intentional outcome: the
 * association negotiation completed but the access policy determined that the requesting AE
 * should not be granted access.
 *
 * @param associationSerialNo a monotonically increasing identifier assigned to this attempt
 * @param callingAet          the AE title presented by the remote SCU
 * @param calledAet           the AE title of the local SCP
 * @param remoteHost          the hostname or IP address of the remote peer
 * @param localHost           the hostname or IP address of the local network interface
 * @param reason              the reason string returned by the access policy
 * @param rejectedAt          an ISO-8601 timestamp recording when the rejection was issued
 */
public record DimseAssociationRejectedEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String remoteHost,
    String localHost,
    String reason,
    String rejectedAt) {}
