package org.dicoogle.sdk.storage;

/**
 * Describes a DIMSE association that has been successfully negotiated and accepted.
 *
 * @param associationSerialNo a monotonically increasing identifier assigned to this association by
 *     the server; unique within a single server lifetime
 * @param callingAet the AE title presented by the remote SCU
 * @param calledAet the AE title of the local SCP that accepted the association
 * @param remoteHost the hostname or IP address of the remote peer
 * @param localHost the hostname or IP address of the local network interface
 * @param acceptedAt an ISO-8601 timestamp recording when the association was accepted
 */
public record DimseAssociationAcceptedEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String remoteHost,
    String localHost,
    String acceptedAt) {}
