package com.oxygenxml.examples.perforce;

import com.perforce.p4java.server.callback.IProgressCallback;

import lombok.extern.slf4j.Slf4j;

/**
 * A simple demo P4Java progress callback implementation. Real implementations
 * would probably correlate the key arguments and associated output, but this
 * version simply puts whatever it's passed onto standard output with a dash
 * prepended.
 */
@Slf4j
public class P4ProgressCallback implements IProgressCallback {

	public void start(int key) {
		log.debug("Starting command {}", key);
	}

	public void stop(int key) {
		log.debug("Stopping command {}", key);
	}

	public boolean tick(int key, String tickMarker) {
		if (tickMarker != null) {
			log.debug("{} - {}", key, tickMarker);
		}
		return true;
	}
}
