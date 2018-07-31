package com.oxygenxml.examples.perforce;

import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.net.PasswordAuthentication;

import org.apache.commons.io.IOUtils;
import org.junit.Test;

public class P4ReadOperationTest {


	String p4Uri = "p4java://localhost:1666//depot/progress.ini";
	
	  @Test
	public void getFileTest() throws Exception {
		P4ReadOperation pg = new P4ReadOperation(p4Uri,
				new PasswordAuthentication("user001", "pass".toCharArray()));
		InputStream is = pg.read();

		StringWriter writer = new StringWriter();
		try {
			IOUtils.copy(is, writer, "UTF-8");
		} catch (IOException e) {
			e.printStackTrace();
		}
		String res = writer.toString();

		System.out.println("File contents:" + res);
		assertTrue("", res.contains("Sample Developer"));
	}

}
