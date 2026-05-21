package org.dicoogle.sdk.storage;

/**
 * Describes a DIMSE association attempt that failed due to a network or protocol error before it
 * could be accepted or rejected by the access policy.
 *
 * @param associationSerialNo a monotonically increasing identifier assigned to this attempt
 * @param callingAet          the AE title presented by the remote peer, if available
 * @param calledAet           the AE title of the local SCP
 * @param remoteHost          the hostname or IP address of the remote peer
 * @param localHost           the hostname or IP address of the local network interface
 * @param reason              a human-readable description of the failure cause
 * @param failedAt            an ISO-8601 timestamp recording when the failure was detected
 */
public record DimseAssociationFailedEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String remoteHost,
    String localHost,
    String reason,
    String failedAt) {}
