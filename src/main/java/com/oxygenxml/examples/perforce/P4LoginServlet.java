package com.oxygenxml.examples.perforce;

import java.io.IOException;
import java.net.PasswordAuthentication;
import java.util.HashMap;
import java.util.Map;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;
import ro.sync.ecss.extensions.api.webapp.plugin.WebappServletPluginExtension;

@Slf4j
public class P4LoginServlet extends WebappServletPluginExtension {

	@Override
	public void doPost(HttpServletRequest httpRequest, HttpServletResponse httpResponse)
			throws ServletException, IOException {
		String userId = httpRequest.getSession().getId();
		String action = httpRequest.getParameter("action");
		String serverId = PerforceUrlStreamHandler.computeServerId(httpRequest.getParameter("server"));

		if ("logout".equals(action)) {
			PerforceUrlStreamHandler.credentials.invalidate(userId);
		} else {
			String user = httpRequest.getParameter("user");
			String passwd = httpRequest.getParameter("passwd");

			log.debug("Credentials submitted for session: {} .\n user: {}, passwd: {}, serverId: {}", userId, user,
					passwd, serverId);

			// Store the user and password.
			Map<String, PasswordAuthentication> userCredentialsMap = PerforceUrlStreamHandler.credentials
					.getIfPresent(userId);
			if (userCredentialsMap == null) {
				// if no credentials previously stored we create a new
				// credentials map.
				userCredentialsMap = new HashMap<>();
				PerforceUrlStreamHandler.credentials.put(userId, userCredentialsMap);
			}
			userCredentialsMap.put(serverId, new PasswordAuthentication(user, passwd.toCharArray()));
		}
	}

	@Override
	public String getPath() {
		return "p4login";
	}

}
