package com.oxygenxml.examples.perforce;

import java.io.IOException;
import java.net.MalformedURLException;
import java.net.PasswordAuthentication;
import java.net.Proxy;
import java.net.URL;
import java.net.URLConnection;
import java.util.Map;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;

import lombok.extern.slf4j.Slf4j;
import ro.sync.ecss.extensions.api.webapp.WebappMessage;
import ro.sync.ecss.extensions.api.webapp.plugin.URLStreamHandlerWithContext;
import ro.sync.ecss.extensions.api.webapp.plugin.UserActionRequiredException;

@Slf4j
public class PerforceUrlStreamHandler extends URLStreamHandlerWithContext {

	/**
	 * Credentials store.
	 */
	public static final Cache<String, Map<String, PasswordAuthentication>> credentials = CacheBuilder.newBuilder()
			.concurrencyLevel(10).maximumSize(10000).build();

	/**
	 * Computes a server identifier out of the requested URL.
	 * 
	 * @param serverUrl
	 *            the URL string.
	 * 
	 * @return the server identifier.
	 */
	public static String computeServerId(String serverUrl) {
		log.debug("Server for which to compute the serverID: {}", serverUrl);

		String serverId = null;
		try {
			URL url = new URL(serverUrl);
			serverId = url.getProtocol() + url.getHost() + url.getPort();
		} catch (MalformedURLException e) {
		}

		log.debug("serverID: {}", serverId);
		return serverId;
	}

	@Override
	protected URLConnection openConnectionInContext(String contextId, URL url, Proxy proxy) throws IOException {
		log.debug("creating connection");

		PasswordAuthentication userCredentials = null;

		// Obtain the credentials for the current user.
		Map<String, PasswordAuthentication> credentialsMap = credentials.getIfPresent(contextId);
		if (credentialsMap != null) {
			log.debug("externalform :{} - {}", url.toExternalForm(), url.toString());
			userCredentials = credentialsMap.get(computeServerId(url.toExternalForm()));
			credentialsMap.keySet().forEach(key -> log.debug("Key in map:" + key));
		}
		
		
		if (userCredentials == null) {		
			throw new UserActionRequiredException(
					new WebappMessage(WebappMessage.MESSAGE_TYPE_CUSTOM, "Authentication required",
							// send back the URL for which to authenticate.
							url.toExternalForm(), true));
		} else {
			log.debug("userCredentials: {} - {}", userCredentials.getUserName(), userCredentials.getPassword());
		}

		URLConnection p4connection = new URLConnection(url) {
			@Override
			public void connect() throws IOException {
				connected = true;
			}
		};
		

		return new PerforceUrlConnection(p4connection, userCredentials);
	}

}
